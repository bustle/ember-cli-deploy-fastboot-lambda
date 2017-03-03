var fs               = require('fs-promise');
var glob             = require('glob');
var path             = require('path');
var RSVP             = require('rsvp');
var AWS              = require('aws-sdk');
var exec             = RSVP.denodeify(require('child_process').exec);
var DeployPlugin     = require('ember-cli-deploy-plugin');

module.exports = DeployPlugin.extend({
  defaultConfig: {
      region: 'us-east-1'
  },
  requiredConfig: ['lambda-function'],

  didBuild: function(context) {
    var packageSkeletonPath = path.join(__dirname, '..', 'assets', 'lambda-package');
    var self = this;

    return fs.copy(packageSkeletonPath, 'tmp/lambda-package')
      // npm install ember-fastboot-server dependency
      .then(function() {
        return exec("npm install --production", { cwd: 'tmp/lambda-package' })
      })
      .then(function() {
        // Copy application's deploy-dist build
        return fs.copy(context.distDir, 'tmp/lambda-package/fastboot-dist')
      })
      .then(function() {
        return exec('npm install --production', { cwd: 'tmp/lambda-package/fastboot-dist' });
      })
      .then(function() {
        self.log('created tmp/lambda-package', { verbose: true });
      });
  },

  activate: function(context) {
    var self = this;
    var lambdaFunction = this.readConfig('lambda-function');
    var region = this.readConfig('region');

    var Lambda = new AWS.Lambda({ region: region });
    var UpdateLambdaFunc = RSVP.denodeify(Lambda.updateFunctionCode.bind(Lambda));

    this.log('zipping up tmp/lambda-package', { verbose: true });
    return exec("zip -qr lambda-package.zip *", { cwd: 'tmp/lambda-package' })
      .then(function() {
        return exec("mv lambda-package.zip ../", { cwd: 'tmp/lambda-package' })
      })
      .then(function() {
        return fs.readFile('tmp/lambda-package.zip');
      })
      .then(function(fileBuf) {
        return UpdateLambdaFunc({
          FunctionName: lambdaFunction,
          ZipFile: fileBuf
        })
      })
      .then(function() {
        self.log('uploaded tmp/lambda-package.zip to AWS Lambda', { verbose: true });
      });
  }
});
