/** Injected by Vite from package.json's version. See vite.config.ts. */
declare const __APP_VERSION__: string;
/**
 * Which channel this build is for, set by the build mode (see vite.config.ts):
 * "web" is the APK from mp-tree.net, "play" the Play Store build, "demo" the
 * in-browser copy on the website. Only "web" checks for updates.
 */
declare const __DISTRIBUTION__: "web" | "play" | "demo";
