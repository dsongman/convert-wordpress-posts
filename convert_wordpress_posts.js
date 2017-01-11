'use strict';
const _ = require('lodash');
const fs = require('fs');
const parseString = require('xml2js').parseString;
const getMovieInfo = require('./tmdb_cache').getMovieInfo;
const getMoviePoster = require('./tmdb_cache').getMoviePoster;
const voca = require('voca');

const postsFileArg = process.argv[2];

const frequencies = {
  'first-view': 'first',
  'functional-first-time': 'functional-first',
  'repeat': 'repeat',
  'regular': 'regular'
};

const getMetaValue = function(metaKey, postmeta) {
  let meta = _.find(postmeta, function(el) {
    return el['wp:meta_key'][0] === metaKey;
  });

  if (_.isUndefined(meta) || meta.length === 0) {
    return false;
  }

  return meta['wp:meta_value'][0];
};

const processWPCategories = function(categories) {
  let movie = {};
  movie.features = [];

  _.each(categories, function(el, index, list) {
    let category = el.$.nicename;
    switch (category) {
      case 'home':
      case 'theater':
      case 'plane':
        movie.location = category;
        break;
      case 'first-view':
      case 'functional-first-time':
      case 'repeat':
      case 'regular':
        movie.frequency = frequencies[category];
        break;
      default:
        movie.features.push(category);
    }
  });

  return movie;
};

const getRelevantMovieInfo = function(movieInfo) {
  let relevantInfo = _.pick(movieInfo, ['title', 'imdb_id', 'poster_path', 'release_date']);
  
  relevantInfo.genres = [];
  _.forEach(movieInfo.genres, genre => {
    relevantInfo.genres.push(genre.name);
  });

  return relevantInfo;
};

var postsFilePath;
var xmlContent;

if (postsFileArg.charAt(0) === '/') {
  postsFilePath = postsFileArg;
} else {
  postsFilePath = './' + postsFileArg;
}

xmlContent = fs.readFileSync(postsFilePath, 'utf8');

parseString(xmlContent, (err, data) => {
  let rawMovie;
  let movieCount = data.rss.channel[0].item.length;
  // movieCount = 1;
  let movies = [];

  for (let i = 0; i < movieCount; i++) {
    let tmdbPromise;
    let tmdbInfo;
    let movie;
    rawMovie = data.rss.channel[0].item[i];

    // Simple properties from the WordPress export
    movie = {
      date: new Date(rawMovie.pubDate[0]),
      content: rawMovie['content:encoded'][0],
      tmdb_id: getMetaValue('tmdb_id', rawMovie['wp:postmeta'])
    };

    // Categories from the WP export
    let categoryProperties = processWPCategories(rawMovie.category);
    _.extend(movie, categoryProperties);

    // if post has tmdb_id, fetch movie info & extend post object with it
    if (movie.tmdb_id !== false) {
      getMovieInfo(movie.tmdb_id)
        .then(results => {
          let relevantInfo = getRelevantMovieInfo(results);
          _.extend(movie, relevantInfo);

          // Save movie poster to disc
          getMoviePoster(movie.poster_path);

          // Save blog post (use voca.slugify on the title for the file name)

          // movies.push(movie);
          // console.log(JSON.stringify(movie));
          // console.log(JSON.stringify(movies));
        })
        .catch(err => {
          console.log('getMovieInfo:err => ', err);
        });

    } else {
      console.log('Missing tmdb_id: ' + movie.date.toDateString() + ' ' + movie.title);
      movie.imdb_id = getMetaValue('imdb_id', rawMovie['wp:postmeta']);
    }
  }
});

