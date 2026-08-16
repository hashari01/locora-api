```javascript
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

const PORT = process.env.PORT || 3000;

const FRONTEND_URL =
    process.env.FRONTEND_URL ||
    "https://hashari01.github.io";

app.disable("x-powered-by");

app.use(
    cors({
        origin: true,
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
        version: "2.0.0"
    });

});


/* =========================================================
   CATEGORY DEFINITIONS
========================================================= */

const CATEGORY_MAP = {

    restaurants: {
        name: "Restaurants",
        filters: [
            ["amenity", "restaurant"]
        ]
    },

    coffee: {
        name: "Coffee",
        filters: [
            ["amenity", "cafe"],
            ["amenity", "coffee_shop"]
        ]
    },

    hotels: {
        name: "Hotels",
        filters: [
            ["tourism", "hotel"],
            ["tourism", "hostel"],
            ["tourism", "guest_house"]
        ]
    },

    shopping: {
        name: "Shopping",
        filters: [
            ["shop", "supermarket"],
            ["shop", "mall"],
            ["shop", "department_store"],
            ["shop", "clothes"],
            ["shop", "convenience"],
            ["shop", "gift"],
            ["shop", "electronics"]
        ]
    },

    things: {
        name: "Things to do",
        filters: [
            ["tourism", "attraction"],
            ["tourism", "museum"],
            ["leisure", "park"],
            ["leisure", "sports_centre"],
            ["amenity", "cinema"],
            ["amenity", "theatre"]
        ]
    },

    services: {
        name: "Services",
        filters: [
            ["amenity", "bank"],
            ["amenity", "pharmacy"],
            ["amenity", "post_office"],
            ["amenity", "car_rental"],
            ["shop", "hairdresser"],
            ["shop", "beauty"]
        ]
    }

};


/* =========================================================
   NOMINATIM SEARCH
========================================================= */

async function searchLocation(query) {

    const url =
        "https://nominatim.openstreetmap.org/search" +
        "?format=jsonv2" +
        "&addressdetails=1" +
        "&limit=5" +
        "&q=" +
        encodeURIComponent(query);

    const response = await fetch(url, {

        headers: {
            "User-Agent":
                "Locora/2.0 (location discovery application)"
        }

    });

    if (!response.ok) {

        throw new Error(
            `Location search failed: ${response.status}`
        );

    }

    return await response.json();

}


/* =========================================================
   LOCATION SEARCH ENDPOINT
========================================================= */

app.get("/search", async (req, res) => {

    try {

        const query =
            typeof req.query.q === "string"
                ? req.query.q.trim()
                : "";

        if (!query) {

            return res.status(400).json({
                success: false,
                error: "Please provide a location."
            });

        }

        if (query.length > 200) {

            return res.status(400).json({
                success: false,
                error: "Search query is too long."
            });

        }

        const results =
            await searchLocation(query);

        const locations =
            results.map(result => ({

                name:
                    result.name ||
                    query,

                displayName:
                    result.display_name,

                latitude:
                    Number(result.lat),

                longitude:
                    Number(result.lon),

                type:
                    result.type ||
                    "unknown",

                category:
                    result.class ||
                    "unknown"

            }))
            .filter(location =>
                Number.isFinite(location.latitude) &&
                Number.isFinite(location.longitude)
            );

        return res.json({

            success: true,

            query,

            results: locations

        });

    } catch (error) {

        console.error(
            "Location search error:",
            error
        );

        return res.status(500).json({

            success: false,

            error:
                "Unable to search for that location."

        });

    }

});


/* =========================================================
   OVERPASS API
========================================================= */

const OVERPASS_SERVERS = [

    "https://overpass-api.de/api/interpreter",

    "https://overpass.kumi.systems/api/interpreter",

    "https://overpass.private.coffee/api/interpreter"

];


/* =========================================================
   BUILD OVERPASS QUERY
========================================================= */

function buildOverpassQuery(
    latitude,
    longitude,
    category
) {

    const categoryInfo =
        CATEGORY_MAP[category];

    if (!categoryInfo) {

        throw new Error(
            "Invalid category."
        );

    }

    const radius = 10000;

    const filters =
        categoryInfo.filters
            .map(
                ([key, value]) =>
                    `
                    nwr[
                        "${key}"="${value}"
                    ](
                        around:${radius},
                        ${latitude},
                        ${longitude}
                    );
                    `
            )
            .join("\n");

    return `
        [out:json][timeout:25];

        (
            ${filters}
        );

        out center tags;
    `;
}


/* =========================================================
   SEARCH NEARBY PLACES
========================================================= */

async function searchNearbyPlaces(
    latitude,
    longitude,
    category
) {

    const query =
        buildOverpassQuery(
            latitude,
            longitude,
            category
        );

    let lastError = null;

    for (
        const server of OVERPASS_SERVERS
    ) {

        try {

            const response =
                await fetch(
                    server,
                    {

                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/x-www-form-urlencoded",
                            "User-Agent":
                                "Locora/2.0"
                        },

                        body:
                            "data=" +
                            encodeURIComponent(
                                query
                            )

                    }
                );

            if (!response.ok) {

                throw new Error(
                    `Overpass returned ${response.status}`
                );

            }

            const data =
                await response.json();

            return data.elements || [];

        } catch (error) {

            console.error(
                `Overpass server failed: ${server}`,
                error.message
            );

            lastError = error;

        }

    }

    throw lastError ||
        new Error(
            "All location servers failed."
        );

}


/* =========================================================
   DISTANCE CALCULATOR
========================================================= */

function calculateDistance(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const earthRadius = 6371;

    const dLat =
        (
            lat2 - lat1
        ) *
        Math.PI /
        180;

    const dLon =
        (
            lon2 - lon1
        ) *
        Math.PI /
        180;

    const a =
        Math.sin(dLat / 2) *
        Math.sin(dLat / 2) +

        Math.cos(
            lat1 *
            Math.PI /
            180
        ) *

        Math.cos(
            lat2 *
            Math.PI /
            180
        ) *

        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return earthRadius * c;

}


/* =========================================================
   GET PLACE COORDINATES
========================================================= */

function getElementCoordinates(
    element
) {

    if (
        element.lat !== undefined &&
        element.lon !== undefined
    ) {

        return {
            latitude:
                Number(element.lat),

            longitude:
                Number(element.lon)
        };

    }

    if (
        element.center &&
        element.center.lat !== undefined &&
        element.center.lon !== undefined
    ) {

        return {
            latitude:
                Number(element.center.lat),

            longitude:
                Number(element.center.lon)
        };

    }

    return null;

}


/* =========================================================
   NEARBY ENDPOINT
========================================================= */

app.get(
    "/nearby",
    async (req, res) => {

        try {

            const latitude =
                Number(req.query.lat);

            const longitude =
                Number(req.query.lon);

            const category =
                typeof req.query.category === "string"
                    ? req.query.category.toLowerCase().trim()
                    : "";

            if (
                !Number.isFinite(latitude) ||
                !Number.isFinite(longitude)
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Valid latitude and longitude are required."

                });

            }

            if (
                latitude < -90 ||
                latitude > 90 ||
                longitude < -180 ||
                longitude > 180
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid coordinates."

                });

            }

            if (!CATEGORY_MAP[category]) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid category."

                });

            }


            console.log("");
            console.log(
                "================================"
            );
            console.log(
                "        LOCORA NEARBY SEARCH"
            );
            console.log(
                "================================"
            );
            console.log(
                "Category:",
                category
            );
            console.log(
                "Latitude:",
                latitude
            );
            console.log(
                "Longitude:",
                longitude
            );


            const elements =
                await searchNearbyPlaces(
                    latitude,
                    longitude,
                    category
                );


            const places =
                elements

                    .map(element => {

                        const coordinates =
                            getElementCoordinates(
                                element
                            );

                        if (!coordinates) {
                            return null;
                        }

                        const tags =
                            element.tags || {};

                        const name =
                            tags.name ||
                            tags["name:en"] ||
                            CATEGORY_MAP[
                                category
                            ].name;

                        const distance =
                            calculateDistance(
                                latitude,
                                longitude,
                                coordinates.latitude,
                                coordinates.longitude
                            );

                        const addressParts = [];

                        if (tags["addr:housenumber"]) {
                            addressParts.push(
                                tags["addr:housenumber"]
                            );
                        }

                        if (tags["addr:street"]) {
                            addressParts.push(
                                tags["addr:street"]
                            );
                        }

                        if (tags["addr:city"]) {
                            addressParts.push(
                                tags["addr:city"]
                            );
                        }

                        if (tags["addr:state"]) {
                            addressParts.push(
                                tags["addr:state"]
                            );
                        }

                        if (tags["addr:postcode"]) {
                            addressParts.push(
                                tags["addr:postcode"]
                            );
                        }

                        return {

                            name,

                            type:
                                tags.amenity ||
                                tags.tourism ||
                                tags.shop ||
                                tags.leisure ||
                                category,

                            category,

                            latitude:
                                coordinates.latitude,

                            longitude:
                                coordinates.longitude,

                            distanceKm:
                                Number(
                                    distance.toFixed(2)
                                ),

                            distanceMiles:
                                Number(
                                    (
                                        distance *
                                        0.621371
                                    ).toFixed(2)
                                ),

                            address:
                                addressParts.join(
                                    ", "
                                ),

                            phone:
                                tags.phone ||
                                tags["contact:phone"] ||
                                null,

                            website:
                                tags.website ||
                                tags["contact:website"] ||
                                null,

                            openingHours:
                                tags.opening_hours ||
                                null,

                            cuisine:
                                tags.cuisine ||
                                null,

                            rating:
                                null

                        };

                    })

                    .filter(Boolean)

                    .sort(
                        (
                            a,
                            b
                        ) =>
                            a.distanceKm -
                            b.distanceKm
                    );


            /*
             * Remove duplicate places.
             */

            const uniquePlaces = [];

            const seen = new Set();

            for (
                const place of places
            ) {

                const key =
                    `${place.name.toLowerCase()}-${place.latitude.toFixed(5)}-${place.longitude.toFixed(5)}`;

                if (
                    seen.has(key)
                ) {
                    continue;
                }

                seen.add(key);

                uniquePlaces.push(
                    place
                );

            }


            /*
             * Return the closest 50 places.
             */

            const finalResults =
                uniquePlaces.slice(
                    0,
                    50
                );


            console.log(
                "Results:",
                finalResults.length
            );

            console.log(
                "================================"
            );


            return res.json({

                success: true,

                category,

                categoryName:
                    CATEGORY_MAP[
                        category
                    ].name,

                location: {

                    latitude,

                    longitude

                },

                count:
                    finalResults.length,

                results:
                    finalResults

            });


        } catch (error) {

            console.error(
                "Nearby search error:",
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    "Unable to find nearby places."

            });

        }

    }
);


/* =========================================================
   CATEGORIES ENDPOINT
========================================================= */

app.get(
    "/categories",
    (req, res) => {

        const categories =
            Object.entries(
                CATEGORY_MAP
            ).map(
                ([id, category]) => ({

                    id,

                    name:
                        category.name

                })
            );

        res.json({

            success: true,

            categories

        });

    }
);


/* =========================================================
   404
========================================================= */

app.use(
    (req, res) => {

        res.status(404).json({

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
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(
            "Server error:",
            error
        );

        res.status(500).json({

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
            "       🌎 LOCORA API"
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

    }
);
```
