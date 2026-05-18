const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch entire monorepo
config.watchFolders = [monorepoRoot];

// Resolve from mobile's node_modules first, then monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Allow GIF assets
config.resolver.assetExts.push("gif");
config.resolver.assetExts.push("wasm");

// Stub expo-sqlite for web (wasm can't bundle)
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "expo-sqlite") {
    return {
      filePath: path.resolve(projectRoot, "lib/expo-sqlite-mock.js"),
      type: "sourceFile",
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
