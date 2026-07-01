module.exports = function(hostname) {

  if (hostname === 'mapseries.mzk.cz') {
    return {
      client_id: '6c133ed6402352753608',
      gatekeeper_url: 'https://mapseries.mzk.cz/server',
    };
  // Customize these settings for your own development/deployment
  // version of geojson.io.
  } else if (hostname === 'mapseries.devel.mzk.cz') {
    return {
      client_id: '5395a41f086b3fcaa499',
      gatekeeper_url: 'http://mapseries.devel.mzk.cz/server',
    };
  } else if (hostname === 'localhost') {
    // Local development. The gatekeeper is our own backend (the index app's
    // AuthenticateProxyServlet at /server/authenticate/*). client_id MUST be the
    // SAME GitHub OAuth App as GITHUB_CLIENT_ID in .env, because the backend
    // exchanges the code with that app's client_secret.
    return {
      client_id: 'Ov23li87ZKHLBBEa8mLu',
      gatekeeper_url: 'http://localhost:8080/server',
    };
  } else {
      return {
        client_id: 'bb7bbe70bd1f707125bc',
        gatekeeper_url: 'https://localhostauth.herokuapp.com'
      };
    }
};
