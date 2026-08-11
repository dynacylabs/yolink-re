// Original webpack module: 60184
//
// The actual HTTP server entry point - creates a single Express app,
// mounts all three known route surfaces onto it, and starts listening.
// Ties together every HTTP-facing module found in this pass:
//   - open-api-routes.js: /open/yolink/v2/api, /open/yolink/token (public
//     Open API, Bearer-JWT/OAuth2 authenticated)
//   - internal-diagnostics-api.js: /_internal (LAN-only, no auth)
//   - wifi-config-api.js: /api/v1 (LAN-only, no auth)
// No HTTPS/TLS anywhere in this path - plain HTTP, on whatever port the
// caller passes in (see task-registrations/start-http-mqtt.js for the
// actual port value used at startup).

const express = require("express");
const { attachExpress: attachOpenApiRoutes } = require("./open-api-routes");
const { attachExpress: attachInternalDiagnostics } = require("./internal-diagnostics-api");
const { attachExpress: attachWifiConfigApi } = require("./wifi-config-api");

function start(port) {
  const expressApp = express();
  attachOpenApiRoutes(expressApp);
  attachInternalDiagnostics(expressApp);
  attachWifiConfigApi(expressApp);
  return new Promise((resolve, reject) => {
    expressApp.listen(port, () => {
      logger.info(`Http Server started at http://localhost:${port}`);
      resolve(true);
    });
  });
}

module.exports = { start };
