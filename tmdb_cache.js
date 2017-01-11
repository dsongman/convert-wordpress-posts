'use strict';
const _ = require('lodash');
const fs = require('fs');
const moment = require('moment');
const request = require('request');
const tmdbAPIKey = require('./_private').tmdb_api_key;
const MovieDB = require('moviedb')(tmdbAPIKey);

const configCacheFilePath = './tmdb_cache/configuration.json';
const infoCachePath = './tmdb_cache/movie_info/';
const postersCachePath = './tmdb_cache/posters/';
const defaultTtl = 1000 * 60 * 60 * 24 * 30; // 30 days

var tmdbImagesBaseUrl;

/**
 * Generates file path to info cache file give tmdb_id.
 *
 * @param  {String} tmdb_id
 * @return {String}
 */
function getInfoCacheFilePathFromId(tmdb_id) {
  return infoCachePath + tmdb_id + '.json';
}

/**
 * Generates file path to movie poster.
 *
 * @param  {String} posterFileName
 * @param  {String} size
 * @return {String}
 */
function getMoviePosterCachePath(posterFileName, size) {
  return postersCachePath + size + posterFileName;
}

/**
 * Compares a date to ttl. Returns true if date is within current Date - ttl.
 *
 * @param  {Date} fileDate
 * @param  {Date} ttl
 * @return {Boolean}
 */
function isValidCacheFileDate(fileDate, ttl) {
  ttl = ttl ? ttl : defaultTtl;
  let oldestValidDate = moment(new Date()).subtract(ttl, 'milliseconds');

  if (moment(fileDate).isBefore(oldestValidDate)) {
    console.log('Cache file is too old.');
    return false;
  }

  return true;
}

/**
 * Resolves if file exists and is newer than default ttl, otherwise rejects.
 *
 * @param  {String} filePath
 * @return {Promise.<Object>}
 */
function validateCacheFileDate(filePath) {
  return new Promise((resolve, reject) => {

    fs.stat(filePath, (err, stats) => {
      if (err) {
        reject(err);
        return;
      }

      if (!isValidCacheFileDate(stats.mtime)) {
        reject(err);
        return;
      }

      resolve({isValidCacheFileDate: true});
    });
  });
}

/**
 * Resolves if file contents are valid JSON. Else, rejects.
 *
 * @param  {String} filePath
 * @return {Promise.<Object>} Parsed JSON from the file.
 */
function validateCacheFileContents(filePath) {
  return new Promise((resolve, reject) => {

    fs.readFile(filePath, (err, fileContents) => {
      let parsedContents;

      if (err) {
        reject(err);
        return;
      }

      try {
        parsedContents = JSON.parse(fileContents);
      }
      catch (exception) {
        reject(exception);
        return;
      }

      resolve(parsedContents);
    });
  });
}

/**
 * Resolves if a cache file passes both validateCacheFileDate && validateCacheFileContents.
 *
 * @param  {String} filePath
 * @return {Promise.<Object>} Parsed JSON of the cache file
 */
function validateCacheFile(filePath) {
  let isValidCacheFileDatePromise = validateCacheFileDate(filePath);
  let isValidCacheFileContentsPromise = validateCacheFileContents(filePath);

  return new Promise((resolve, reject) => {
    Promise.all([isValidCacheFileDatePromise, isValidCacheFileContentsPromise])
      .then(results => {
        resolve(results);
      })
      .catch(err => {
        reject(err);
      });
  });
}

/**
 * Saves movieInfo object into a file using tmdb_id as the file name.
 *
 * @param  {String} tmdb_id
 * @param  {Object} movieInfo
 * @return {Promise.<Object>}
 */
function saveMovieInfo(tmdb_id, movieInfo) {
  return new Promise((resolve, reject) => {
    let filePath = getInfoCacheFilePathFromId(tmdb_id);
    let fileContents = JSON.stringify(movieInfo);

    fs.writeFile(filePath, fileContents, (err) => {
      if (err) {
        reject(err);
        return;
      }

      resolve({
        saveMovieInfo: true,
        filePath: filePath
      });
    });
  });
}

/**
 * Fetches moveInfo from MovieDB and resolves a promise using passed in functions
 * `resolve` and `reject`.
 *
 * @param  {String} tmdb_id
 * @param  {Function} resolve
 * @param  {Function} reject
 */
function fetchMovieInfo(tmdb_id, resolve, reject) {
  // fetch data
  MovieDB.movieInfo({id: tmdb_id}, (err, data) => {
    if (!_.isNull(err)) {
      reject(err);
    }

    console.log('Info for ' + tmdb_id + ' (' + data.title + ') fetched.');

    // save info in the bg
    saveMovieInfo(tmdb_id, data)
      .then(results => {
        console.log(results.filePath + ' saved.');
      })
      .catch(err => {
        console.error(err);
      });

    resolve(data);
  });
}

/**
 * Returns movieInfo of a given tmdb_id, either from cache or fetch.
 *
 * @param  {String} tmdb_id
 * @return {Promise.<Object>}
 */
function getMovieInfo(tmdb_id) {
  return new Promise((resolve, reject) => {
    let cacheFilePath = getInfoCacheFilePathFromId(tmdb_id);

    validateCacheFile(cacheFilePath)
      .then(results => {
        console.log('Info for ' + tmdb_id + ' (' + results[1].title + ') found in cache.');
        resolve(results[1]); // resolve with cached json
      })
      .catch(err => {
        // console.log('validateCacheFile:err => ', err);
        fetchMovieInfo(tmdb_id, resolve, reject);
      });
  
  });
}

/**
 * Saves configurationData object into the config cache file.
 *
 * @param  {Object} configData
 * @return {Promise.<Object>}
 */
function saveAPIConfiguration(configData) {
  return new Promise((resolve, reject) => {
    let fileContents = JSON.stringify(configData);

    fs.writeFile(configCacheFilePath, fileContents, (err) => {
      if (err) {
        reject(err);
        return;
      }

      resolve({
        saveAPIConfiguration: true,
        filePath: configCacheFilePath
      });
    });
  });
}

/**
 * Fetches configuration from MovieDB and resolves a promise using passed in functions
 * `resolve` and `reject`.
 *
 * @param  {Function} resolve
 * @param  {Function} reject
 */
function fetchAPIConfiguration(resolve, reject) {
  // fetch data
  MovieDB.configuration((err, data) => {
    if (!_.isNull(err)) {
      reject(err);
    }

    console.log('API configuration fetched.');

    // save info in the bg
    saveAPIConfiguration(data)
      .then(results => {
        console.log(results.filePath + ' saved.');
      })
      .catch(err => {
        console.error(err);
      });

    resolve(data);
  });
}

/**
 * Returns configuration object for the TMDB API
 *
 * @return {Promise.<external:TMDB.ConfigurationObject>}
 */
function getAPIConfiguration() {
  return new Promise((resolve, reject) => {

    validateCacheFile(configCacheFilePath)
      .then(results => {
        console.log('Configuration data found in cache.');
        resolve(results[1]); // resolve with cached json
      })
      .catch(err => {
        fetchAPIConfiguration(resolve, reject);
      });
  
  });
}

/**
 * @return {Promise.<String>} Base URL for images on TMDB
 */
function getTMDBImagesBaseUrl() {
  return new Promise((resolve, reject) => {

    if (!_.isUndefined(tmdbImagesBaseUrl)) {
      console.log('tmdbImagesBaseUrl already set.');
      resolve(tmdbImagesBaseUrl);
      return;
    }

    console.log('tmdbImagesBaseUrl not set.');

    getAPIConfiguration()
      .then(results => {
        tmdbImagesBaseUrl = results.images.base_url;
        resolve(tmdbImagesBaseUrl);
      })
      .catch(err => {
        reject(tmdbImagesBaseUrl);
      });
  });
}

/**
 * Saves movieInfo object into a file using tmdb_id as the file name.
 *
 * @param  {String} posterFileName
 * @param  {String} size
 * @return {Promise.<String>}
 */
function fetchAndSaveMoviePoster(posterFileName, size) {
  return new Promise((resolve, reject) => {
    let destPath = getMoviePosterCachePath(posterFileName, size);

    getTMDBImagesBaseUrl()
      .then(tmdbImagesBaseUrl => {
        console.log('getTMDBImagesBaseUrl:tmdbImagesBaseUrl => ', tmdbImagesBaseUrl);
        let r;
        let url = tmdbImagesBaseUrl + size + posterFileName;

        r = request(url);

        r.on('error', err => {
          console.log('request:error => ', err);
          reject(err);
        })
        // 404 responses aren't caught by 'error'
        .on('response', response => {
          if (response.statusCode !== 200) {
            reject(response);
            return;
          }

          r.pipe(fs.createWriteStream(destPath))
          .on('close', () => {
            resolve(destPath);
          });
        });
      })
      .catch(err => {
        reject(err);
      });

  });
}

/**
 * Returns file path to the movie poster, downloading the image if not already done.
 *
 * @param  {String} posterFileName
 * @param  {String} size
 * @return {Promise.<String>}
 */
function getMoviePoster(posterFileName, size) {
  return new Promise((resolve, reject) => {
    let destPath;

    if (_.isUndefined(size)) {
      size = 'original';
    }

    destPath = getMoviePosterCachePath(posterFileName, size);

    validateCacheFileDate(destPath)
      .then(results => {
        console.log('Poster ' + posterFileName + ' found in cache.');
        resolve(destPath);
      })
      .catch(err => {
        fetchAndSaveMoviePoster(posterFileName, size)
          .then(result => {
            resolve(result);
          })
          .catch(err => {
            reject(err);
          });
      });
  });
}

exports.getMovieInfo = getMovieInfo;
exports.getMoviePoster = getMoviePoster;
