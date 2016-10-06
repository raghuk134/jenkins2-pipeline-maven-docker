'use strict';
var pkg = require('./package.json'),
  autoprefixer = require('gulp-autoprefixer'),
  browserify = require('browserify'),
  buffer = require('vinyl-buffer'),
  chmod = require('gulp-chmod'),
  closureCompiler = require('google-closure-compiler').gulp(),
  connect = require('gulp-connect'),
  csso = require('gulp-csso'),
  del = require('del'),
  exec = require('gulp-exec'),
  ghpages = require('gh-pages'),
  gulp = require('gulp'),
  gutil = require('gulp-util'),
  path = require('path'),
  plumber = require('gulp-plumber'), // plumber prevents pipe breaking caused by errors thrown by plugins
  rename = require('gulp-rename'),
  source = require('vinyl-source-stream'),
  stylus = require('gulp-stylus'),
  through = require('through'),
  tidy = require('tidy-html5').tidy_html5,
  uglify = require('gulp-uglify'),
  closureCompilerOpts = {
    compilation_level: 'SIMPLE', // ADVANCED breaks bespoke-fullscreen
    warning_level: 'QUIET',
    language_in: 'ES5_STRICT',
    language_out: 'ES5'
  },
  tidyOpts = {
    'anchor-as-name': 'false',
    'coerce-endtags': 'false',
    'drop-empty-elements': 'false',
    'fix-uri': 'false',
    'indent': 'false',
    'literal-attributes': 'true',
    'newline': 'LF',
    'preserve-entities': 'true',
    'quiet': 'true',
    'show-warnings': 'false',
    'tidy-mark': 'false',
    'wrap': '0'
  },
  isDist = process.argv.indexOf('deploy') >= 0;

gulp.task('js', ['clean:js'], function() {
  // see https://wehavefaces.net/gulp-browserify-the-gulp-y-way-bb359b3f9623
  return browserify('src/scripts/main.js').bundle()
    // NOTE this error handler fills the role of plumber() when working with browserify
    .on('error', function(e) { if (isDist) { throw e; } else { gutil.log(e.stack); this.emit('end'); } })
    .pipe(source('src/scripts/main.js'))
    .pipe(buffer())
    .pipe(isDist ? closureCompiler(closureCompilerOpts) : uglify())
    .pipe(rename('build.js'))
    .pipe(gulp.dest('dist/build'))
    .pipe(connect.reload());
});

gulp.task('html', ['clean:html'], function() {
  return gulp.src('src/index.adoc')
    .pipe(isDist ? through() : plumber())
    // NOTE using stdin here would cause loss of context
    .pipe(exec('bundle exec asciidoctor-bespoke -T src/templates -o - src/index.adoc', { pipeStdout: true }))
    .pipe(exec.reporter({ stdout: false }))
    .pipe(through(function(file) {
      var html = tidy(file.contents.toString(), tidyOpts) // NOTE based on tidy 4.9.26
        // strip extra newlines inside <pre> tags (fixed in tidy 5.1.2)
        .replace(new RegExp('<pre([^>]*)>\\n([\\s\\S]*?)\\n</pre>', 'g'), '<pre$1>$2</pre>\n')
        // strip extra newline after <script> start tag for empty and single-line content
        .replace(new RegExp('>\\n(?:(.+)\\n)?</script>', 'g'), '>$1</script>')
        // add newline before <script> tags
        .replace(new RegExp('><script([^>]*)>', 'g'), '>\n<script$1>');
      file.contents = new Buffer(html);
      this.push(file);
    }))
    .pipe(rename('index.html'))
    .pipe(chmod(644))
    .pipe(gulp.dest('dist'))
    .pipe(connect.reload());
});

gulp.task('css', ['clean:css'], function() {
  return gulp.src('src/styles/main.styl')
    .pipe(isDist ? through() : plumber())
    .pipe(stylus({ 'include css': true, paths: ['./node_modules'] }))
    .pipe(autoprefixer({ browsers: ['last 2 versions'], cascade: false }))
    .pipe(isDist ? csso() : through())
    .pipe(rename('build.css'))
    .pipe(gulp.dest('dist/build'))
    .pipe(connect.reload());
});

gulp.task('images', ['clean:images'], function() {
  return gulp.src('src/images/**/*')
    .pipe(gulp.dest('dist/images/'))
    .pipe(connect.reload());
});

gulp.task('clean', function() {
  return del('dist');
});

gulp.task('clean:html', function() {
  return del('dist/index.html');
});

gulp.task('clean:js', function() {
  return del('dist/build/build.js');
});

gulp.task('clean:css', function() {
  return del('dist/build/build.css');
});

gulp.task('clean:images', function() {
  return del('dist/images/*');
});

gulp.task('connect', ['build'], function() {
  connect.server({ root: 'dist', port: 8000, livereload: true });
});

gulp.task('watch', function() {
  gulp.watch('src/**/*.adoc', ['html']);
  gulp.watch('src/scripts/**/*.js', ['js']);
  gulp.watch('src/styles/**/*.styl', ['css']);
  gulp.watch('src/images/**/*', ['images']);
});

gulp.task('deploy', ['clean', 'build'], function(done) {
  ghpages.publish(path.join(__dirname, 'dist'), { logger: gutil.log }, done);
});

gulp.task('build', ['js', 'html', 'css', 'images']);
gulp.task('serve', ['deploy', 'connect', 'watch']);
gulp.task('default', ['serve']);
