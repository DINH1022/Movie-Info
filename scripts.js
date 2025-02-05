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
                reviews : '/Reviews'
            }
        };

        let endpoint = endpoints[request.type]?.[request.className];
        if (!endpoint) throw new Error(`Invalid request: ${request.type}/${request.className}`);
        return endpoint;
    },

    processResults(data, request) {
        let items = [];
        let sum = 0;

        switch (request.type) {
            case 'detail':
                items = Array.isArray(data) ? [data[0]] : [data];
                sum = 1;
                break;

            case 'search':
                const searchTerm = request.pattern.toLowerCase();
                if (request.className === 'movie') {
                    items = data.filter(movie =>
                        movie.title?.toLowerCase().includes(searchTerm));
                } else {
                    items = data.filter(name => {
                        if (typeof name === 'string') {
                            return name.toLowerCase().includes(searchTerm);
                        }
                        return name.name?.toLowerCase().includes(searchTerm);
                    });
                }
                sum = items.length;
                break;

            case 'get':
                items = Array.isArray(data) ? data : [data];
                sum = items.length;
                break;

            default:
                throw new Error(`Invalid request type: ${request.type}`);
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
    },

};


const MovieDBProvider = {
    async getFeaturedMovies() {
        try {
            const result = await DBUtility.fetch('get/all/?per_page=300&page=1');
            
            const sortedMovies = result.items
                .filter(movie => movie.boxOffice?.cumulativeWorldwideGross)
                .map(movie => ({
                    ...movie,
                    grossNumber: Number(movie.boxOffice.cumulativeWorldwideGross.replace(/[$,]/g, ''))
                }))
                .sort((a, b) => b.grossNumber - a.grossNumber)
                .slice(0, 5);
    
            return sortedMovies;
        } catch (error) {
            console.error('Error getting featured movies:', error);
            return [];
        }
    },

    async getPopularMovies() {
        const result = await DBUtility.fetch('get/mostpopular/?per_page=30&page=1');
        return result.items;
    },

    async getTopRatedMovies() {
        const result = await DBUtility.fetch('get/top50/?per_page=30&page=1');
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
    async searchByActor(query) {
        try {
            const nameResult = await DBUtility.fetch(`search/name/${query}?per_page=300&page=1`);
            const actorNames = nameResult.items;

            const allMovies = await DBUtility.fetch('get/all/?per_page=300&page=1');
            const moviesWithActors = allMovies.items.filter(movie => {
                return movie.actorList?.some(actor =>
                    actorNames.some(name =>
                        (typeof name === 'string' && actor.name.toLowerCase().includes(name.toLowerCase())) ||
                        (name.name && actor.name.toLowerCase().includes(name.name.toLowerCase()))
                    )
                );
            });

            return moviesWithActors;
        } catch (error) {
            console.error('Actor search error:', error);
            return [];
        }
    },

    async getMovieDetails(movieId) {
        try {
            const result = await DBUtility.fetch(`detail/movie/${movieId}`);
            return result.items[0];
        } catch (error) {
            console.error('Movie details error:', error);
            throw error;
        }
    },
    async getMovieReviews(movieId) {
        try {
            const result = await DBUtility.fetch('get/reviews');
            const movieReviews = result.items.find(review => review.movieId === movieId);
            return movieReviews?.items || [];
        } catch (error) {
            console.error('Reviews error:', error);
            return [];
        }
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
        },
        rating() {
            return this.movie.ratings?.imDb || 'N/A';
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
                        <p class="rating">
                            <i class="fas fa-star" style="color: #ffd700;"></i>
                            {{ rating }}/10
                        </p>
                        <p class="length">{{ movie.runtimeStr }}</p>
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
    data() {
        return {
            reviews: []
        };
    },
    async created() {
        if (this.movie.id) {
            this.reviews = await MovieDBProvider.getMovieReviews(this.movie.id);
        }
    },
    computed: {
        imageUrl() {
            return this.movie.image || this.movie.posterUrl || 'https://via.placeholder.com/300x450?text=No+Image';
        },
        genres() {
            if (!this.movie.genreList) return 'N/A';

            return this.movie.genreList
                .map(genre => genre.value || genre)
                .filter(genre => genre)
                .join(', ');
        },
        actors() {
            if (!this.movie.actorList) return 'N/A';

            return this.movie.actorList
                .map(actor => actor.name || actor)
                .filter(actor => actor)
                .join(', ');
        },
        directors() {
            if (!this.movie.directorList) return 'N/A';

            return this.movie.directorList
                .map(director => director.name || director)
                .filter(director => director)
                .join(', ');
        }
    },
    template: `
        <div v-if="show" class="movie-details-container">
        <div class="movie-details-grid">
            <div class="movie-poster-container d-flex align-items-center justify-content-center  py-3">
                <img :src="imageUrl" :alt="movie.title" class="movie-detail-poster">
            </div>
            <div class="movie-info-container">
                <div class="d-flex justify-content-between align-items-start mb-3">
                    <h2>{{movie.fullTitle || movie.title}}</h2>
                    <button class="btn btn-outline-secondary" @click="$emit('close')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="movie-meta">
                    <p v-if="movie.awards"><strong>Award:</strong> {{movie.awards}}</p>
                    <p v-if="movie.countries"><strong>Country:</strong> {{movie.countries}}</p>
                    <p v-if="movie.languages"><strong>Language:</strong> {{movie.languages}}</p>
                    <p v-if="movie.directorList"><strong>Director:</strong> {{directors}}</p>
                    <p v-if="movie.actorList"><strong>Actors:</strong> {{actors}}</p>
                    <p v-if="movie.genreList"><strong>Genres:</strong> {{genres}}</p>
                    <p v-if="movie.runtimeStr"><strong>Time:</strong> {{movie.runtimeStr }}</p>
                </div>
                <div v-if="movie.plot " class="movie-plot">
                    <h3>Plot</h3>
                    <p>{{movie.plot }}</p>
                </div>
            </div>
            
        </div>
        <div class="movie-reviews mt-4">
            <h3 class="mb-3 text-muted">Reviews ({{reviews.length}})</h3>
            <div v-if="reviews.length" class="reviews-container" style="max-height: 400px; overflow-y: auto;">
                <div v-for="review in reviews" :key="review.username" class="card mb-3">
                    <div class="card-body">
                        <h5 class="card-title">{{review.title}}</h5>
                        <h6 class="card-subtitle mb-2 text-muted">By {{review.username}}</h6>
                        <p class="card-text">{{review.content}}</p>
                    </div>
                </div>
            </div>
            <p v-else class="text-muted">No reviews yet</p>
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
            itemsPerPage: 9
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
        
        <div class="search-results-container">
            <div class="search-results-grid">
                <div class="search-result-item" v-for="movie in paginatedMovies" :key="movie.id">
                    <featured-movie-card :movie="movie" @show-details="handleShowDetails"></featured-movie-card>
                </div>
            </div>
        </div>

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
            showSearchResults: false,
        };
    },
    computed: {
        popularMovieSlides() {
            return this.getVisibleMovies(this.popularMovies, 'popular');
        },
        topRatedMovieSlides() {
            return this.getVisibleMovies(this.topRatedMovies, 'topRated');
        },
        isShowingDetails() {
            return this.showMovieDetails && this.selectedMovie;
        },

    },
    
    methods: {
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
        goHome() {
            this.isLoading = true;
            setTimeout(async () => {
                this.searchQuery = "";
                this.showMovieDetails = false;
                this.showSearchResults = false;
                this.selectedMovie = null;
                
                await this.loadInitialData();
                
                this.isLoading = false;
            }, 500); 
        },
        async searchMovies() {
            if (!this.searchQuery.trim()) return;
            this.isLoading = true;
            this.hasSearched = true;
            this.currentPage = 1;
            this.showSearchResults = true; 
            this.showMovieDetails = false;
            try {
                const actorResults = await MovieDBProvider.searchByActor(this.searchQuery);
                const titleResults = await MovieDBProvider.searchMovies(this.searchQuery);
                const combinedResults = [...actorResults, ...titleResults];
                this.searchResults = Array.from(new Map(combinedResults.map(movie => 
                    [movie.id, movie]
                )).values());

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
            this.$emit('show-details', { id: this.movie.id });
        },
        async showDetails(movie) {
            try {
                this.isLoading = true;
                const detailedMovie = await MovieDBProvider.getMovieDetails(movie.id);
                this.selectedMovie = detailedMovie;
                this.showMovieDetails = true;
                this.showSearchResults = false;
            } catch (error) {
                console.error('Error fetching movie details:', error);
            } finally {
                this.isLoading = false;
            }
        },
        closeDetails() {
            this.showMovieDetails = false;
            this.selectedMovie = null;
            this.showSearchResults = true;
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
        },

    },
    async mounted() {
        await this.loadInitialData();
    }

}).mount("#app");
