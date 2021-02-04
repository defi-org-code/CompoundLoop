import fs from "fs";
import path from "path";

const configPath = path.resolve(process.env.npm_package_configFile || `${__dirname}/../.config.json`);

export function config() {
  if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, "{}");
  return JSON.parse(fs.readFileSync(configPath, { encoding: "utf8" }));
}
