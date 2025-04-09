require('dotenv').config();
const express = require('express');
const app = express();
const routes = require('./src/routes');

// Use the routes
app.use('/api', routes);

// Print all registered routes
function printRoutes(layer, path = '') {
  if (layer.route) {
    const methods = Object.keys(layer.route.methods)
      .filter(method => layer.route.methods[method])
      .join(', ');
    console.log(`${methods.toUpperCase()} ${path}${layer.route.path}`);
  } else if (layer.name === 'router' && layer.handle.stack) {
    const routerPath = path + (layer.regexp ? layer.regexp.toString().replace(/[?+*()/\\]/g, '').replace(/^\/\^/, '').replace(/\$\/$/, '') : '');
    layer.handle.stack.forEach(stackItem => {
      printRoutes(stackItem, routerPath);
    });
  }
}

// Print the configured routes
console.log('Configured Routes:');
app._router.stack.forEach(layer => {
  if (layer.name === 'router' && layer.handle.stack) {
    layer.handle.stack.forEach(stackItem => {
      printRoutes(stackItem, '/api');
    });
  }
});

console.log('\nUser Routes:');
const userRoutes = require('./src/routes/user.routes');
userRoutes.stack.forEach(layer => {
  printRoutes(layer, '/user');
});

console.log('\nFull routes object:', Object.keys(routes)); 