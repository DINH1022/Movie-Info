const DBUtility = {
    baseUrl: 'http://matuan.online:2422/api',
    defaultParams: { per_page: 10, page: 1 },

    parseRequestString(input) {
        const [type, className, ...rest] = input.split('/');
        const [pattern, queryString] = (rest.join('/') || '').split('?');
        
        const params = new URLSearchParams(queryString);
        const queryParams = {};
        for (const [key, value] of params) {
            queryParams[key] = value;
        }

        return {
            type, className, pattern: pattern || '',
            params: { ...this.defaultParams, ...queryParams }
        };
    },

    buildEndpoint(request) {
        const endpoints = {
            search: {
                movie: '/Movies',
                name: '/Names'
            },
            detail: {
                movie: `/Movies/${request.pattern}`
            },
            get: {
                top50: '/Top50Movies',
                mostpopular: '/MostPopularMovies',
                topboxoffice: '/TopBoxOffice'
            }
        };

        const endpoint = endpoints[request.type]?.[request.className];
        if (!endpoint) throw new Error(`Invalid request: ${request.type}/${request.className}`);
        return endpoint;
    },

    processResults(data, request) {
        let items = [];
        
        if (request.type === 'search') {
            const searchTerm = request.pattern.toLowerCase();
            items = request.className === 'movie' 
                ? data.filter(movie => movie.title.toLowerCase().includes(searchTerm))
                : data.filter(name => name.toLowerCase().includes(searchTerm));
        } else {
            items = Array.isArray(data) ? data : [data];
        }

        const total = items.length;
        const page = parseInt(request.params.page);
        const perPage = parseInt(request.params.per_page);
        const start = (page - 1) * perPage;

        return {
            search: request.pattern,
            page, per_page: perPage,
            total_page: Math.ceil(total / perPage),
            total,
            items: items.slice(start, start + perPage)
        };
    },

    async fetch(requestString) {
        try {
            const request = this.parseRequestString(requestString);
            const endpoint = this.buildEndpoint(request);
            const response = await fetch(`${this.baseUrl}${endpoint}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            return this.processResults(data, request);
        } catch (error) {
            console.error('DBUtility fetch error:', error);
            throw error;
        }
    }
};

const MovieDBProvider = {
    async getFeaturedMovie() {
        const result = await DBUtility.fetch('get/mostpopular/?per_page=1&page=1');
        return result.items[0];
    },

    async getPopularMovies() {
        const result = await DBUtility.fetch('get/mostpopular/?per_page=4&page=1');
        return result.items;
    },

    async getTopRatedMovies() {
        const result = await DBUtility.fetch('get/top50/?per_page=4&page=1');
        return result.items;
    },

    async searchMovies(query) {
        const [movieResult, nameResult] = await Promise.all([
            DBUtility.fetch(`search/movie/${query}?per_page=20&page=1`),
            DBUtility.fetch(`search/name/${query}?per_page=20&page=1`)
        ]);

        const movieMatches = movieResult.items;
        const nameMatches = nameResult.items;

        const nameRelatedMovies = nameMatches.length > 0
            ? (await DBUtility.fetch('get/mostpopular/?per_page=50&page=1')).items
                .filter(movie => nameMatches.some(name => 
                    movie.actors?.includes(name) || movie.director?.includes(name)
                ))
            : [];

        return [...new Set([...movieMatches, ...nameRelatedMovies])];
    },

    async getMovieReviews(movieId) {
        const result = await DBUtility.fetch(`detail/movie/${movieId}`);
        return result.items[0]?.reviews || [];
    }
};

const MovieCard = {
    props: {
        movie: { type: Object, required: true }
    },
    computed: {
        imageUrl() {
            return this.movie.image || this.movie.posterUrl || 'https://via.placeholder.com/300x450?text=No+Image';
        }
    },
    template: `
        <div class="col">
            <div class="card h-100 movie-card">
                <img 
                    :src="imageUrl" 
                    class="card-img-top movie-poster" 
                    :alt="movie.title"
                    @error="handleImageError"
                    loading="lazy"
                >
                <div class="movie-hover-info">
                    <h5>{{ movie.title }}</h5>
                    <p>{{ movie.year || 'Year N/A' }}</p>
                    <div class="rating" v-if="movie.rating">
                        <i class="fas fa-star text-warning"></i>
                        <span>{{ movie.rating }}/5</span>
                    </div>
                </div>
            </div>
        </div>
    `,
    methods: {
        handleImageError(e) {
            e.target.src = 'https://via.placeholder.com/300x450?text=No+Image';
        }
    }
};
const { createApp } = Vue;


createApp({
    components: { "movie-card": MovieCard },
    data() {
        return {
            isDarkMode: false,
            searchQuery: "",
            featuredMovie: {},
            popularMovies: [],
            topRatedMovies: [],
            searchResults: [],
            error: null,
            isLoading: false,
            movieReviews: {}
        };
    },
    methods: {
        async searchMovies() {
            if (!this.searchQuery.trim()) return;
            this.isLoading = true;
            try {
                this.searchResults = await MovieDBProvider.searchMovies(this.searchQuery);
            } catch (error) {
                this.error = "Error searching movies";
                console.error(error);
            } finally {
                this.isLoading = false;
            }
        },
        async loadInitialData() {
            this.isLoading = true;
            try {
                [this.featuredMovie, this.popularMovies, this.topRatedMovies] = 
                    await Promise.all([
                        MovieDBProvider.getFeaturedMovie(),
                        MovieDBProvider.getPopularMovies(),
                        MovieDBProvider.getTopRatedMovies()
                    ]);
            } catch (error) {
                this.error = "Error loading movies";
                console.error(error);
            } finally {
                this.isLoading = false;
            }
        },
        async loadMovieReviews(movieId) {
            if (this.movieReviews[movieId]) return;
            try {
                this.movieReviews[movieId] = await MovieDBProvider.getMovieReviews(movieId);
            } catch (error) {
                console.error('Error loading reviews:', error);
                this.error = "Error loading reviews";
            }
        }
    },
    async mounted() {
        await this.loadInitialData();
    }
}).mount("#app");