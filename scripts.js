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
                all: '/Movies',
                top50: '/Top50Movies',
                mostpopular: '/MostPopularMovies',
                topboxoffice: '/Movies'
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
                ? data.filter(movie => movie.title?.toLowerCase().includes(searchTerm))
                : data.filter(name => {
                    if (typeof name === 'string') {
                        return name.toLowerCase().includes(searchTerm);
                    }
                    return name.name?.toLowerCase().includes(searchTerm);
                    return false;
                });
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
    async getFeaturedMovies() {
        const result = await DBUtility.fetch('get/topboxoffice/?per_page=5&page=1');
        return result.items;
    },

    async getPopularMovies() {
        const result = await DBUtility.fetch('get/mostpopular/?per_page=12&page=1');
        console.log('Popular movies:', result);
        return result.items;
    },

    async getTopRatedMovies() {
        const result = await DBUtility.fetch('get/top50/?per_page=12&page=1');
        return result.items;
    },

    async searchMovies(query) {
        try {
            const movieResult = await DBUtility.fetch(`search/movie/${query}?per_page=300&page=1`);
            console.log('Search results:', movieResult);
            return movieResult.items;
        } catch (error) {
            console.error('Search error:', error);
            return [];
        }
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
            <div class="card h-100 movie-card" @click="handleClick">
                <img 
                    :src="imageUrl" 
                    class="card-img-top movie-poster" 
                    :alt="movie.title"
                    @error="handleImageError"
                    loading="lazy"
                >
                <div class="movie-hover-info">
                    <h5>{{ movie.fullTitle }}</h5>
                </div>
            </div>
        </div>
    `,
    methods: {
        handleImageError(e) {
            e.target.src = 'https://via.placeholder.com/300x450?text=No+Image';
        },
        handleClick() {
            // Emit the showDetails event to the parent
            this.$emit('show-details', this.movie);
        },
    }
};
const FeaturedMovieCard = {
    props: {
        movie: { type: Object, required: true }
    },
    computed: {
        imageUrl() {
            return this.movie.image || 'https://via.placeholder.com/300x450?text=No+Image';
        },
        genres() {
            if (!this.movie.genreList) return 'N/A';

            return this.movie.genreList
                .map(genre => genre.value || genre)
                .filter(genre => genre)
                .join(', ');
        }
    },
    template: `
        <div class="col">
            <div class="card featured-movie-card" @click="handleClick">
                <img 
                    :src="imageUrl" 
                    class="featured-movie-poster"
                    :alt="movie.title"
                    @error="handleImageError"
                >
                <div class="featured-movie-content">
                    <h3 class="movie-title">
                        {{ movie.fullTitle }}
                    </h3>
                    <div class="movie-details">
                        <p class="genre">{{ genres }}</p>
                    </div>
                </div>
            </div>
        </div>
    `,
    methods: {
        handleImageError(e) {
            e.target.src = 'https://via.placeholder.com/300x450?text=No+Image';
        },
        handleClick() {
            // Emit the showDetails event to the parent
            this.$emit('show-details', this.movie);
        },
    }
};
const MovieDetails = {
    props: {
        movie: { type: Object, required: true },
        show: { type: Boolean, default: false }
    },
    emits: ['close'],
    computed: {
        imageUrl() {
            return this.movie.image || this.movie.posterUrl || 'https://via.placeholder.com/300x450?text=No+Image';
        }
    },
    template: `
        <div v-if="show" class="movie-details-modal" @click.self="$emit('close')">
            <div class="movie-details-content">
                <button class="close-btn" @click="$emit('close')">&times;</button>
                <div class="movie-details-grid">
                    <div class="movie-poster-container">
                        <img :src="imageUrl" :alt="movie.title" class="movie-detail-poster">
                    </div>
                    <div class="movie-info-container">
                        <h2>{{movie.fullTitle || movie.title}}</h2>
                        <div class="movie-meta">
                            <p v-if="movie.year"><strong>Year:</strong> {{movie.year}}</p>
                            <p v-if="movie.imDbRating"><strong>Rating:</strong> {{movie.imDbRating}}/10</p>
                            <p v-if="movie.runtimeStr || movie.runtime">
                                <strong>Runtime:</strong> {{movie.runtimeStr || movie.runtime}}
                            </p>
                        </div>
                        <div v-if="movie.plot || movie.description" class="movie-plot">
                            <h3>Plot</h3>
                            <p>{{movie.plot || movie.description}}</p>
                        </div>
                        <div v-if="movie.directors" class="movie-crew">
                            <p><strong>Director:</strong> {{movie.directors}}</p>
                        </div>
                        <div v-if="movie.stars" class="movie-cast">
                            <p><strong>Stars:</strong> {{movie.stars}}</p>
                        </div>
                        <div v-if="movie.genres" class="movie-genres">
                            <p><strong>Genres:</strong> {{movie.genres}}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
};
const SearchResults = {
    components: {
        'featured-movie-card': FeaturedMovieCard,  
    },
    props: {
        searchQuery: { type: String, required: true },
        movies: { type: Array, required: true },
        isLoading: { type: Boolean, default: false },
        hasSearched: { type: Boolean, default: false }
    },
    emits: ['show-details'],
    data() {
        return {
            currentPage: 1,
            itemsPerPage: 9 // Changed from 3 to 9
        }
    },
    computed: {
        paginatedMovies() {
            const start = (this.currentPage - 1) * this.itemsPerPage;
            const end = start + this.itemsPerPage;
            return this.movies.slice(start, end);
        },
        totalPages() {
            return Math.ceil(this.movies.length / this.itemsPerPage);
        }
    },
    methods: {
        changePage(page) {
            if (page >= 1 && page <= this.totalPages) {
                this.currentPage = page;
            }
        },
        handleShowDetails(movie) {
            // Forward the show-details event to parent
            this.$emit('show-details', movie);
        }
    },
    watch: {
        searchQuery() {
            this.currentPage = 1;
        },
    },
    template: `
    <div v-if="searchQuery && movies.length > 0" class="mb-5">
        <h2 class="mb-4">Search Results for "{{searchQuery}}"</h2>
        
        <!-- Results Grid -->
        <div class="search-results-container">
            <div class="search-results-grid">
                <div class="search-result-item" v-for="movie in paginatedMovies" :key="movie.id">
                    <featured-movie-card :movie="movie" @show-details="handleShowDetails"></featured-movie-card>
                </div>
            </div>
        </div>

        <!-- Pagination -->
        <nav v-if="totalPages > 1" class="mt-4" aria-label="Search results pages">
            <ul class="pagination justify-content-center">
                <li class="page-item" :class="{ disabled: currentPage === 1 }">
                    <button class="page-link" @click="changePage(currentPage - 1)">Previous</button>
                </li>
                <li v-for="page in totalPages" 
                    :key="page" 
                    class="page-item" 
                    :class="{ active: page === currentPage }">
                    <button class="page-link" @click="changePage(page)">{{page}}</button>
                </li>
                <li class="page-item" :class="{ disabled: currentPage === totalPages }">
                    <button class="page-link" @click="changePage(currentPage + 1)">Next</button>
                </li>
            </ul>
        </nav>
    </div>
    
    <div v-else-if="hasSearched && searchQuery && !isLoading && movies.length === 0" class="alert alert-info">
        No results found for "{{searchQuery}}"
    </div>
    <div v-if="isLoading" class="text-center">
        <div class="spinner-border" role="status">
            <span class="visually-hidden">Loading...</span>
        </div>
    </div>
`
};

const { createApp } = Vue;


createApp({
    components: {
        "movie-card": MovieCard,
        "featured-movie-card": FeaturedMovieCard,
        "search-results": SearchResults,
        "movie-details": MovieDetails
    },
    data() {
        return {
            isDarkMode: false,
            searchQuery: "",
            featuredMovies: [],
            featuredSlideIndex: 0,
            popularMovies: [],
            popularSlideIndex: 0,
            topRatedMovies: [],
            topRatedSlideIndex: 0,
            searchResults: [],
            error: null,
            isLoading: false,
            movieReviews: {},
            moviesPerSlide: 3,
            hasSearched: false,
            selectedMovie: null,
            showMovieDetails: false,
        };
    },
    computed: {
        popularMovieSlides() {
            return this.getVisibleMovies(this.popularMovies, 'popular');
        },
        topRatedMovieSlides() {
            return this.getVisibleMovies(this.topRatedMovies, 'topRated');
        },

    },
    methods: {
        async searchMovies() {
            if (!this.searchQuery.trim()) return;
            this.isLoading = true;
            this.hasSearched = true;
            this.currentPage = 1; 
            try {
                this.searchResults = await MovieDBProvider.searchMovies(this.searchQuery);
            } catch (error) {
                this.error = "Error searching movies";
                console.error(error);
            } finally {
                this.isLoading = false;
            }
        },
        changePage(page) {
            this.currentPage = page;
        },
        handleClick() {
            this.$emit('showDetails', this.movie);
        },
        showDetails(movie) {
            this.selectedMovie = movie;
            this.showMovieDetails = true;
        },
        closeDetails() {
            this.showMovieDetails = false;
            this.selectedMovie = null;
        },
        async loadInitialData() {
            this.isLoading = true;
            try {
                [this.featuredMovies, this.popularMovies, this.topRatedMovies] =
                    await Promise.all([
                        MovieDBProvider.getFeaturedMovies(),
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
        },
        getVisibleMovies(movies, section) {
            const index = section === 'popular' ? this.popularSlideIndex : this.topRatedSlideIndex;
            const start = this.moviesPerSlide * index;
            return movies.slice(start, start + this.moviesPerSlide);
        },
        nextSlide(section) {
            const maxIndex = Math.ceil(
                (section === 'popular' ? this.popularMovies : this.topRatedMovies).length /
                this.moviesPerSlide
            ) - 1;

            if (section === 'popular') {
                this.popularSlideIndex = this.popularSlideIndex >= maxIndex ? 0 : this.popularSlideIndex + 1;
            } else {
                this.topRatedSlideIndex = this.topRatedSlideIndex >= maxIndex ? 0 : this.topRatedSlideIndex + 1;
            }
        },
        prevSlide(section) {
            const maxIndex = Math.ceil(
                (section === 'popular' ? this.popularMovies : this.topRatedMovies).length /
                this.moviesPerSlide
            ) - 1;

            if (section === 'popular') {
                this.popularSlideIndex = this.popularSlideIndex <= 0 ? maxIndex : this.popularSlideIndex - 1;
            } else {
                this.topRatedSlideIndex = this.topRatedSlideIndex <= 0 ? maxIndex : this.topRatedSlideIndex - 1;
            }
        },
        nextFeaturedSlide() {
            this.featuredSlideIndex = (this.featuredSlideIndex + 1) % this.featuredMovies.length;
        },
        prevFeaturedSlide() {
            this.featuredSlideIndex = this.featuredSlideIndex <= 0 ?
                this.featuredMovies.length - 1 : this.featuredSlideIndex - 1;
        }
    },
    async mounted() {
        await this.loadInitialData();
    }
}).mount("#app");