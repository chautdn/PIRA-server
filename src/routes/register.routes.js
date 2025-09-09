const routes = [];

const registerRoute = (path, router) => {
  routes.push({ path, router });
};

const getRoutes = () => routes;

module.exports = {
  registerRoute,
  getRoutes
};
