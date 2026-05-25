const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];

// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// 3. Enable symlink support — critical for pnpm which uses symlinks
//    in its content-addressable store
config.resolver.unstable_enableSymlinks = true;

// 4. Force 'default' transform profile so Babel transpiles ALL modern
//    syntax (classes, private fields, etc.) to ES5. The bundled hermesc
//    (0.12.0) does not support ES6 classes or private class fields.
// config.transformer.unstable_transformProfile = "default";
config.transformer.babelTransformerPath = require.resolve('./custom-babel-transformer.js');

module.exports = config;
