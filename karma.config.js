module.exports = function (config) {
    config.set({
        frameworks: ['mocha', 'chai', 'browserify'],
        files: [
            'src/**/*.js',
            'test/**/*.js'
        ],
        preprocessors: {
            './src/**/*.js': ['browserify'],
            './test/**/*.js': ['browserify']
        },
        browserify: {
            debug: true,
            paths: ['src', 'test'],
            "transform": [
                [
                    "babelify",
                    {
                        presets: ["es2015"]
                    }
                ]
            ]
        },
        reporters: ['progress'],
        port: 9876,  // karma web server port
        colors: true,
        logLevel: config.LOG_INFO,
        browsers: ['Firefox'],
        autoWatch: false,
        singleRun: true,
        concurrency: Infinity,
        customLaunchers: {
            FirefoxHeadless: {
                base: 'Firefox',
                flags: ['-headless'],
            },
        },
    })
}