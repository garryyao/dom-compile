'use strict';

const path = require('path');

module.exports = {
  entry: {
    lib: ['./index.js']
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    publicPath: '/dist/',
    filename: '[name].js',
    library: 'render',
    libraryTarget: 'var'
  },
  module: {
    loaders: [{
      test: /\.js$/,
      exclude: /(node_modules|bower_components)/,
      loader: 'babel'
    }]
  }
};
