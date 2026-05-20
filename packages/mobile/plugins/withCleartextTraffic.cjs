const path = require("path");

// Resolve @expo/config-plugins from monorepo root
const configPluginsPath = path.resolve(
  __dirname,
  "../../../node_modules/.bun/@expo+config-plugins@54.0.4/node_modules/@expo/config-plugins"
);
const { withAndroidManifest } = require(configPluginsPath);

module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application[0];
    app.$["android:usesCleartextTraffic"] = "true";
    return config;
  });
};
