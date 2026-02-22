import { DefinePlugin } from "@rspack/core";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pkg from "./package.json" with { type: "json" };

const commitHash = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "nogit";
  }
})();

/** @type {import('@rspack/core').Configuration} */
export default {
  mode: process.env.NODE_ENV === "production" ? "production" : "development",
  devtool: false,
  entry: {
    "webrascal.all": "./src/entry.ts",
    "webrascal.worker": "./src/worker/index.ts",
    "webrascal.controller": "./src/controller/entry.ts"
  },
  output: {
    path: fileURLToPath(new URL("./dist", import.meta.url)),
    filename: "[name].js",
    library: {
      type: "global"
    },
    globalObject: "self"
  },
  resolve: {
    extensions: [".ts", ".js"]
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: "builtin:swc-loader",
        options: {
          jsc: {
            parser: {
              syntax: "typescript"
            },
            target: "es2022"
          }
        }
      }
    ]
  },
  plugins: [
    new DefinePlugin({
      COMMITHASH: JSON.stringify(commitHash),
      VERSION: JSON.stringify(pkg.version),
      REWRITERWASM: JSON.stringify(process.env.REWRITERWASM || "")
    })
  ]
};
