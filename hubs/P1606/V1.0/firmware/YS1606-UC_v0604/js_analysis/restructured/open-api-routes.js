// Original webpack module: 50741
//
// The actual Express route mounting for the public-facing "Open API" -
// this is what finally ties http-api-wrapper.js, oauth2-provider.js, and
// message-dispatcher.js's HandlerDispatcher together into real HTTP
// endpoints. Two route groups:
//   - POST /open/yolink/v2/api - the main device-command API, wrapped by
//     HttpAPIWrapper.wrapperOpenApiV2 (Bearer-JWT auth) and dispatched to
//     HandlerDispatcher.sharedInstance().dispatcherAPIRequest.
//   - ALL /open/yolink/token - the OAuth2 token endpoint, accepting
//     client_id/client_secret/grant_type/refresh_token/scope/code from
//     body, query string, OR route params, plus HTTP Basic auth
//     (Authorization: Basic base64(client_id:client_secret)) as a
//     fallback for client_credentials grants.

const { Router, json, urlencoded } = require("express");
const { HttpAPIWrapper } = require("./http-api-wrapper");
const { OAuth2Provider } = require("./oauth2-provider");
const { HandlerDispatcher } = require("./message-dispatcher");

const apiRouter = Router();
const tokenRouter = Router();

apiRouter.use(json());
tokenRouter.use(json());
tokenRouter.use(urlencoded({ extended: true }));

apiRouter.post("/api", (req, res, next) => {
  try {
    HttpAPIWrapper.wrapperOpenApiV2(req, res, (wrappedReq, wrappedRes) => {
      wrappedRes.respond(HandlerDispatcher.sharedInstance().dispatcherAPIRequest(wrappedReq, wrappedRes).then((result) => result));
    });
  } catch (e) {
    next(e);
  }
});

tokenRouter.all("/token", (req, res) => {
  let routeParams = req.params;
  let grant = {
    client_id: req.body?.client_id || req.query?.client_id || routeParams.client_id,
    client_secret: req.body?.client_secret || req.query?.client_secret || routeParams.client_secret,
    grant_type: req.body?.grant_type || req.query?.grant_type || routeParams.grant_type,
    refresh_token: req.body?.refresh_token || req.query?.refresh_token || routeParams.refresh_token,
    scope: req.body?.scope || req.query.scope || routeParams.scope,
    code: req.body?.code || req.query?.code || routeParams.code,
    redirect_uri: req.body?.redirect_uri || req.query?.redirect_uri || routeParams.redirect_uri,
  };

  // HTTP Basic auth fallback for client_credentials grants.
  if (grant.grant_type == "client_credentials" && grant.client_id == null && req.header("Authorization") != null) {
    try {
      let basic = req.header("Authorization").replace("Basic ", "");
      let parts = Buffer.from(basic, "base64").toString().split(":");
      if (parts.length == 2) {
        grant.client_id = parts[0];
        grant.client_secret = parts[1];
      }
    } catch (e) {}
  }

  OAuth2Provider.sharedInstance()
    .grantToken(grant)
    .then((token) => {
      res.json(token);
    })
    .catch((err) => {
      logger.error(err, "Grant token failed");
      res.json({ state: "error", msg: err?.message ?? "Not supported auth" });
    });
});

function attachExpress(expressApp) {
  expressApp.use("/open/yolink/v2", apiRouter);
  expressApp.use("/open/yolink/", tokenRouter);
}

module.exports = { attachExpress };
