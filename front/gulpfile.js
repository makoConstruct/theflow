var gulp = require('gulp')
var ts = require('gulp-typescript')
var webpack = require('webpack-stream')

var wpconf = {
	entry: './jsified/mainpage.js',
	output: {
		filename: 'mainpage.js'
	},
	resolve: {
		extensions: ['', '.webpack.js', '.web.js', '.ts', '.js']
	},
	module: {
		loaders: [
			{ test: /\.ts$/, loader: 'ts-loader' }
		]
	}
}

// var wpconf = {
// 	resolve: {
// 		extensions: ['', '.webpack.js', '.web.js', '.js']
// 	},
// 	module: {
// 		loaders: [
// 			{ test: /\.ts$/, loader: 'ts-loader' }
// 		]
// 	}
// }

var tsProject = ts.createProject('tsconfig.json', { typescript: require('typescript')  })

gulp.task('default', ['build_front'])

gulp.task('do_js', ()=>
	tsProject.src()
		.pipe(tsProject(ts.reporter.defaultReporter())).js
		.pipe(gulp.dest('jsified/'))
)
gulp.task('build_front', ['do_js'], ()=>
	gulp.src('nonexistent file.js') //hahah look it doesn't pay any attention to the input stream. SEAMLESS INTEGRATION.
		.pipe(webpack(wpconf))
		.pipe(gulp.dest('assets/'))
)

// gulp.task('build_back', (cb)=>{
// 	exec('cargo build', (err, stdout, stderr)=> {
// 		console.log(stdout);
// 		console.error(stderr);
// 		cb(err);
// 	})
// })

// gulp.task('nomomo', function (cb) {
// 	exec('cargo build', {'cwd':'../back/theflow/'}, (err, stdout, stderr)=> {
// 		console.log(stdout)
// 		console.log(stderr)
// 		cb(err)
// 	});
// })
 