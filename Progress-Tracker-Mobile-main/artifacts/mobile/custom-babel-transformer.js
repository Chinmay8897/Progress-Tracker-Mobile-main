const upstreamTransformer = require('@expo/metro-config/build/babel-transformer');

module.exports.transform = function(args) {
  if (!args.options) {
    args.options = {};
  }
  if (!args.options.customTransformOptions) {
    args.options.customTransformOptions = {};
  }
  // Force Babel to transpile for JSC (which includes full ES5 transforms for classes and private fields).
  // This is required because React Native 0.81.5 bundles Hermes 0.12.0 which does NOT support private fields natively.
  args.options.customTransformOptions.engine = 'jsc';
  
  return upstreamTransformer.transform(args);
};
