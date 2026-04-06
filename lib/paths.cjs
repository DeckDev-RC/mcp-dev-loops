const fs = require("fs");
const os = require("os");
const path = require("path");

function getPackageRoot() {
  return path.join(__dirname, "..");
}

function findProjectRoot(startDir = process.cwd()) {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    dir = path.dirname(dir);
  }
  return startDir;
}

function getProjectConfigDir() {
  return path.join(findProjectRoot(), ".devs-loop");
}

function getHomeConfigDir() {
  return path.join(os.homedir(), ".devs-loop");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

module.exports = {
  ensureDir,
  findProjectRoot,
  getHomeConfigDir,
  getPackageRoot,
  getProjectConfigDir,
};
