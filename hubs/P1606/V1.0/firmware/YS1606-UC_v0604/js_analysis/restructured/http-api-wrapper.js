// Original webpack module: 75883
//
// The actual Express route-handler wrapper for the LCSubnet HTTP API -
// the missing link between oauth2-provider.js/lcsubnet-token.js (JWT
// bearer-token auth), lcsubnet-auth.js (APIRequestContext), and
// api-handler-base.js/lock-api-handler.js (per-device-type dispatch).
// Wraps a raw handler function with: Bearer-token extraction and
// validity-window check (iat/exp), OAuth2Provider token verification,
// APIRequestContext construction, and uniform JSON response shaping
// (code/time/msgid/method/desc/data), converting thrown InterfaceErrors
// into the appropriate HTTP status via InterfaceError.httpStatusCode().

const _ = require("underscore"); // original module 74979 re-exports module 81772 (underscore.js)
const { InterfaceError } = require("./errors");
const { APIRequestContext } = require("./lcsubnet-auth");
const { JWTToken } = require("./lcsubnet-token");
const { OAuth2Provider } = require("./oauth2-provider");

class HttpRequestContext extends APIRequestContext {}

class HttpAPIWrapper {
  // `respond(req, res)` is the actual per-device-type handler (e.g.
  // api-handler-base.js's `.handler.bind(lockApiHandlerInstance)`), which
  // must call `res.respond(resultOrPromiseOrError)`.
  static wrapperOpenApiV2(expressReq, expressRes, respond) {
    let sendOnce = _.once((result) => {
      var now = new Date().getTime();
      var response = {
        code: "000000",
        time: now,
        msgid: expressReq.body?.msgid || now,
        method: expressReq.body?.method,
        desc: "Success",
        data: {},
      };
      if (expressReq.body.type) response.method = expressReq.body.type + "." + expressReq.body.method;
      if (result instanceof Error) {
        let err = InterfaceError.fromError(result);
        response.code = err.code;
        response.desc = err.message;
        let status = err.httpStatusCode();
        if (status != null) expressRes.status(status);
      } else if (result instanceof Object) {
        _.extend(response.data, result);
      }
      expressRes.json(response);
    });

    Promise.resolve()
      .then(() => {
        if (expressReq.headers.authorization == null || expressReq.headers.authorization.indexOf("Bearer ") != 0) {
          throw new InterfaceError("010103");
        }
        let token = new JWTToken(expressReq.headers.authorization.split(" ")[1]);
        let decoded = token.getDecoded();
        if (decoded == null) throw new InterfaceError("010103");
        let nowSeconds = Date.now() / 1000;
        if ((decoded.iat != null && decoded.iat > nowSeconds) || (decoded.exp != null && decoded.exp < nowSeconds) || decoded.iss == null) {
          throw new InterfaceError("010104");
        }
        return token;
      })
      .then((token) => token)
      .then((token) => OAuth2Provider.sharedInstance().checkAccessToken(token))
      .then((auth) => {
        respond(
          { context: new HttpRequestContext(auth, "HTTP"), body: expressReq.body },
          {
            respond: (result) => {
              if (result == null) sendOnce(new Error("404"));
              else if (result instanceof Error) {
                logger.error(result);
                sendOnce(result);
              } else if (result instanceof Promise) {
                result.then((value) => sendOnce(value)).catch((err) => {
                  logger.error(err);
                  sendOnce(err);
                });
              } else {
                sendOnce(new Error("999999"));
              }
            },
          }
        );
      })
      .catch((err) => {
        logger.error(err);
        sendOnce(err);
      });
  }
}

module.exports = { HttpAPIWrapper };
