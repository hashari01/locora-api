require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

const PORT = process.env.PORT || 3000;

const FRONTEND_URL =
    process.env.FRONTEND_URL ||
    "https://hashari01.github.io/locora/";


/* =========================================================
   APP CONFIG
========================================================= */

app.disable("x-powered-by");

app.use(
    cors({
        origin: [
            "https://hashari01.github.io",
            "https://hashari01.github.io/locora",
            "https://hashari01.github.io/locora/"
        ],
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type"]
    })
);

app.use(
    express.json({
        limit: "100kb"
    })
);


/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/", (req, res) => {

    res.json({
        success: true,
        service: "Locora API",
        status: "online",
        version: "1.0.0"
    });

});


/* =========================================================
   CONFIGURATION
========================================================= */

const NOMINATIM_URL =
    "https://nominatim.openstreetmap.org/search";

const USER_AGENT =
    "Locora/1.0 (https://hashari01.github.io/locora/)";


/* =========================================================
   SEARCH LOCATION
========================================================= */

app.get(
    "/search",
    async (req, res) => {

        try {

            const query =
                typeof req.query.q === "string"
                    ? req.query.q.trim()
                    : "";

            if (!query) {

                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Please provide a search query."
                    });

            }


            if (query.length > 200) {

                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Search query is too long."
                    });

            }


            const url =
                new URL(NOMINATIM_URL);

            url.searchParams.set(
                "q",
                query
            );

            url.searchParams.set(
                "format",
                "json"
            );

            url.searchParams.set(
                "addressdetails",
                "1"
            );

            url.searchParams.set(
                "limit",
                "5"
            );


            const response =
                await fetch(
                    url.toString(),
                    {
                        method: "GET",

                        headers: {
                            "User-Agent":
                                USER_AGENT,

                            "Accept":
                                "application/json"
                        }
                    }
                );


            if (!response.ok) {

                console.error(
                    "Nominatim error:",
                    response.status
                );

                return res
                    .status(502)
                    .json({
                        success: false,
                        error:
                            "Location search is temporarily unavailable."
                    });

            }


            const data =
                await response.json();


            const results =
                Array.isArray(data)
                    ? data.map(place => ({

                        name:
                            place.display_name
                                ?.split(",")[0]
                                ?.trim() ||
                            "Unknown location",

                        displayName:
                            place.display_name ||
                            "",

                        latitude:
                            Number(place.lat),

                        longitude:
                            Number(place.lon),

                        type:
                            place.type ||
                            "unknown",

                        category:
                            place.category ||
                            "unknown"

                    }))
                    : [];


            return res.json({

                success: true,

                query,

                results

            });


        } catch (error) {

            console.error(
                "Location search error:",
                error
            );

            return res
                .status(500)
                .json({
                    success: false,
                    error:
                        "Unable to search locations."
                });

        }

    }
);


/* =========================================================
   PLACE SEARCH
========================================================= */

app.get(
    "/places",
    async (req, res) => {

        try {

            const query =
                typeof req.query.q === "string"
                    ? req.query.q.trim()
                    : "";

            const location =
                typeof req.query.location === "string"
                    ? req.query.location.trim()
                    : "";


            if (!query) {

                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Please provide a place search."
                    });

            }


            if (query.length > 150) {

                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Search query is too long."
                    });

            }


            /*
             * If the user gives a location,
             * search for:
             *
             * "coffee shops in Indianapolis"
             *
             * Otherwise just search the query.
             */

            const fullQuery =
                location
                    ? `${query} in ${location}`
                    : query;


            const url =
                new URL(NOMINATIM_URL);

            url.searchParams.set(
                "q",
                fullQuery
            );

            url.searchParams.set(
                "format",
                "json"
            );

            url.searchParams.set(
                "addressdetails",
                "1"
            );

            url.searchParams.set(
                "limit",
                "10"
            );


            const response =
                await fetch(
                    url.toString(),
                    {
                        method: "GET",

                        headers: {
                            "User-Agent":
                                USER_AGENT,

                            "Accept":
                                "application/json"
                        }
                    }
                );


            if (!response.ok) {

                return res
                    .status(502)
                    .json({
                        success: false,
                        error:
                            "Place search is temporarily unavailable."
                    });

            }


            const data =
                await response.json();


            const results =
                Array.isArray(data)
                    ? data.map(place => ({

                        name:
                            place.display_name
                                ?.split(",")[0]
                                ?.trim() ||
                            "Unknown place",

                        displayName:
                            place.display_name ||
                            "",

                        latitude:
                            Number(place.lat),

                        longitude:
                            Number(place.lon),

                        type:
                            place.type ||
                            "unknown",

                        category:
                            place.category ||
                            "unknown",

                        address:
                            place.display_name ||
                            ""

                    }))
                    : [];


            return res.json({

                success: true,

                query,

                location,

                results

            });


        } catch (error) {

            console.error(
                "Place search error:",
                error
            );

            return res
                .status(500)
                .json({
                    success: false,
                    error:
                        "Unable to search places."
                });

        }

    }
);


/* =========================================================
   DISCOVERY CATEGORIES
========================================================= */

const categories = {

    restaurants: {
        name: "Restaurants",
        icon: "🍽️",
        search: "restaurants"
    },

    coffee: {
        name: "Coffee",
        icon: "☕",
        search: "coffee shops"
    },

    hotels: {
        name: "Hotels",
        icon: "🏨",
        search: "hotels"
    },

    shopping: {
        name: "Shopping",
        icon: "🛍️",
        search: "shopping"
    },

    things: {
        name: "Things to do",
        icon: "🎯",
        search: "things to do"
    }

};


/* =========================================================
   CATEGORIES ENDPOINT
========================================================= */

app.get(
    "/categories",
    (req, res) => {

        res.json({

            success: true,

            categories

        });

    }
);


/* =========================================================
   CATEGORY SEARCH
========================================================= */

app.get(
    "/discover",
    async (req, res) => {

        try {

            const category =
                typeof req.query.category === "string"
                    ? req.query.category.toLowerCase().trim()
                    : "";

            const location =
                typeof req.query.location === "string"
                    ? req.query.location.trim()
                    : "";


            if (!categories[category]) {

                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Invalid discovery category."
                    });

            }


            if (!location) {

                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Please provide a location."
                    });

            }


            const searchTerm =
                categories[category].search;


            const fullQuery =
                `${searchTerm} in ${location}`;


            const url =
                new URL(NOMINATIM_URL);

            url.searchParams.set(
                "q",
                fullQuery
            );

            url.searchParams.set(
                "format",
                "json"
            );

            url.searchParams.set(
                "addressdetails",
                "1"
            );

            url.searchParams.set(
                "limit",
                "10"
            );


            const response =
                await fetch(
                    url.toString(),
                    {
                        method: "GET",

                        headers: {
                            "User-Agent":
                                USER_AGENT,

                            "Accept":
                                "application/json"
                        }
                    }
                );


            if (!response.ok) {

                return res
                    .status(502)
                    .json({
                        success: false,
                        error:
                            "Discovery search is temporarily unavailable."
                    });

            }


            const data =
                await response.json();


            const results =
                Array.isArray(data)
                    ? data.map(place => ({

                        name:
                            place.display_name
                                ?.split(",")[0]
                                ?.trim() ||
                            "Unknown place",

                        displayName:
                            place.display_name ||
                            "",

                        latitude:
                            Number(place.lat),

                        longitude:
                            Number(place.lon),

                        type:
                            place.type ||
                            "unknown",

                        category:
                            place.category ||
                            category,

                        address:
                            place.display_name ||
                            ""

                    }))
                    : [];


            return res.json({

                success: true,

                category,

                categoryName:
                    categories[category].name,

                location,

                results

            });


        } catch (error) {

            console.error(
                "Discovery error:",
                error
            );

            return res
                .status(500)
                .json({
                    success: false,
                    error:
                        "Unable to discover places."
                });

        }

    }
);


/* =========================================================
   API STATUS
========================================================= */

app.get(
    "/status",
    (req, res) => {

        res.json({

            success: true,

            service: "Locora API",

            status: "online",

            features: {

                locationSearch: true,

                placeSearch: true,

                categories: true,

                discovery: true

            },

            frontend:
                FRONTEND_URL

        });

    }
);


/* =========================================================
   404
========================================================= */

app.use(
    (req, res) => {

        res
            .status(404)
            .json({

                success: false,

                error:
                    "Endpoint not found."

            });

    }
);


/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
    (error, req, res, next) => {

        console.error(
            "Server error:",
            error
        );

        res
            .status(500)
            .json({

                success: false,

                error:
                    "Internal server error."

            });

    }
);


/* =========================================================
   START SERVER
========================================================= */

app.listen(
    PORT,
    () => {

        console.log("");
        console.log(
            "================================"
        );
        console.log(
            "        LOCORA API"
        );
        console.log(
            "================================"
        );
        console.log(
            `Port: ${PORT}`
        );
        console.log(
            `Frontend: ${FRONTEND_URL}`
        );
        console.log(
            "Status: ONLINE"
        );
        console.log(
            "================================"
        );
        console.log("");

    }
);
