import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /node_modules\/(react|react-dom|react-router-dom|@tanstack\/react-query)\//,
            },
            {
              name: "wallet-vendor",
              test: /node_modules\/(@mysten\/dapp-kit|@mysten\/wallet-standard|@wallet-standard|@radix-ui|zustand|react-remove-scroll)\//,
            },
            {
              name: "sui-sdk",
              test: /node_modules\/@mysten\/sui\//,
            },
            {
              name: "pyth-vendor",
              test: /node_modules\/(@pythnetwork|@wormhole-foundation|@certusone)\//,
            },
            {
              name: "crypto-vendor",
              test: /node_modules\/(@noble|@scure|bech32|bs58|js-sha3|poseidon-lite)\//,
            },
            {
              name: "vendor",
              test: /node_modules\//,
            },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      "node:buffer": "buffer",
    },
  },
});
