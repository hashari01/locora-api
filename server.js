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

app.use(express.json());


/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/", (req, res) => {

    res.json({
        success: true,
        service: "Locora API",
        status: "online",
        version: "3.0.0"
    });

});


/* =========================================================
   LOCATION SEARCH
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
                error: "Search query is required."
            });

        }


        const url =
            "https://nominatim.openstreetmap.org/search?" +
            new URLSearchParams({

                q: query,

                format: "json",

                addressdetails: "1",

                limit: "5"

            });


        const response =
            await fetch(url, {

                headers: {

                    "User-Agent":
                        "Locora/3.0 (location discovery website)"

                }

            });


        if (!response.ok) {

            throw new Error(
                `Nominatim returned ${response.status}`
            );

        }


        const data =
            await response.json();


        const results =
            data.map(place => ({

                name:
                    place.name ||
                    place.display_name.split(",")[0],

                displayName:
                    place.display_name,

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

            }));


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


        return res.status(500).json({

            success: false,

            error:
                "Unable to search for this location."

        });

    }

});


/* =========================================================
   CATEGORY DEFINITIONS
========================================================= */

/*
    IMPORTANT:

    These names MATCH the names sent by index.html:

    restaurant
    cafe
    hotel
    shop
    attraction
    service
*/

const CATEGORY_QUERIES = {

    restaurant: (radius, lat, lon) => `

[out:json][timeout:30];

nwr(
    around:${radius},${lat},${lon}
)["amenity"="restaurant"];

out center tags;

`,


    cafe: (radius, lat, lon) => `

[out:json][timeout:30];

nwr(
    around:${radius},${lat},${lon}
)["amenity"="cafe"];

out center tags;

`,


    hotel: (radius, lat, lon) => `

[out:json][timeout:30];

nwr(
    around:${radius},${lat},${lon}
)["tourism"="hotel"];

out center tags;

`,


    shop: (radius, lat, lon) => `

[out:json][timeout:30];

nwr(
    around:${radius},${lat},${lon}
)["shop"];

out center tags;

`,


    attraction: (radius, lat, lon) => `

[out:json][timeout:30];

(

    nwr(
        around:${radius},${lat},${lon}
    )["tourism"="attraction"];

    nwr(
        around:${radius},${lat},${lon}
    )["tourism"="museum"];

    nwr(
        around:${radius},${lat},${lon}
    )["tourism"="gallery"];

    nwr(
        around:${radius},${lat},${lon}
    )["tourism"="theme_park"];

    nwr(
        around:${radius},${lat},${lon}
    )["tourism"="zoo"];

    nwr(
        around:${radius},${lat},${lon}
    )["leisure"="park"];

    nwr(
        around:${radius},${lat},${lon}
    )["leisure"="sports_centre"];

    nwr(
        around:${radius},${lat},${lon}
    )["leisure"="stadium"];

);

out center tags;

`,


    service: (radius, lat, lon) => `

[out:json][timeout:30];

(

    nwr(
        around:${radius},${lat},${lon}
    )["craft"];

    nwr(
        around:${radius},${lat},${lon}
    )["office"];

    nwr(
        around:${radius},${lat},${lon}
    )["amenity"~"bank|post_office|clinic|pharmacy|car_repair|dentist|doctors|laundry|hairdresser"];

);

out center tags;

`

};


/* =========================================================
   OVERPASS SERVERS
========================================================= */

/*
   If one Overpass server is busy or unavailable,
   Locora automatically tries the next one.
*/

const OVERPASS_SERVERS = [

    "https://overpass-api.de/api/interpreter",

    "https://overpass.private.coffee/api/interpreter",

    "https://overpass.kumi.systems/api/interpreter"

];


/* =========================================================
   OVERPASS REQUEST
========================================================= */

async function fetchOverpass(
    query
) {

    let lastError = null;


    for (
        const server of OVERPASS_SERVERS
    ) {

        try {

            console.log(
                `Trying Overpass server: ${server}`
            );


            const response =
                await fetch(
                    server,
                    {

                        method: "POST",

                        headers: {

                            "Content-Type":
                                "application/x-www-form-urlencoded",

                            "User-Agent":
                                "Locora/3.0"

                        },

                        body:
                            new URLSearchParams({
                                data: query
                            })

                    }
                );


            if (!response.ok) {

                throw new Error(
                    `Overpass returned ${response.status}`
                );

            }


            const data =
                await response.json();


            if (
                !data ||
                !Array.isArray(data.elements)
            ) {

                throw new Error(
                    "Invalid Overpass response"
                );

            }


            console.log(
                `Overpass success: ${data.elements.length} elements`
            );


            return data;


        } catch (error) {

            console.error(
                `Overpass failed: ${server}`,
                error.message
            );


            lastError = error;

        }

    }


    throw lastError ||
        new Error(
            "All Overpass servers failed."
        );

}


/* =========================================================
   NEARBY PLACES
========================================================= */

app.get("/places", async (req, res) => {

    try {

        const lat =
            Number(req.query.lat);

        const lon =
            Number(req.query.lon);


        const requestedCategory =
            typeof req.query.category === "string"
                ? req.query.category
                    .trim()
                    .toLowerCase()
                : "";


        /*
         * Accept both the new frontend names
         * and the old names just in case.
         */

        const categoryAliases = {

            restaurant:
                "restaurant",

            restaurants:
                "restaurant",

            cafe:
                "cafe",

            coffee:
                "cafe",

            cafes:
                "cafe",

            hotel:
                "hotel",

            hotels:
                "hotel",

            shop:
                "shop",

            shopping:
                "shop",

            shops:
                "shop",

            attraction:
                "attraction",

            attractions:
                "attraction",

            things:
                "attraction",

            "things-to-do":
                "attraction",

            service:
                "service",

            services:
                "service"

        };


        const category =
            categoryAliases[
                requestedCategory
            ];


        /* =====================================================
           VALIDATE COORDINATES
        ===================================================== */

        if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lon)
        ) {

            return res.status(400).json({

                success: false,

                error:
                    "Valid latitude and longitude are required."

            });

        }


        if (
            lat < -90 ||
            lat > 90 ||
            lon < -180 ||
            lon > 180
        ) {

            return res.status(400).json({

                success: false,

                error:
                    "Invalid coordinates."

            });

        }


        /* =====================================================
           VALIDATE CATEGORY
        ===================================================== */

        if (!category) {

            return res.status(400).json({

                success: false,

                error:
                    "Invalid category.",

                availableCategories:
                    [
                        "restaurant",
                        "cafe",
                        "hotel",
                        "shop",
                        "attraction",
                        "service"
                    ]

            });

        }


        /* =====================================================
           SEARCH RADIUS
        ===================================================== */

        const radius = 5000;


        console.log(
            `Searching ${category} near ${lat}, ${lon}`
        );


        /* =====================================================
           BUILD QUERY
        ===================================================== */

        const query =
            CATEGORY_QUERIES[category](
                radius,
                lat,
                lon
            );


        /* =====================================================
           SEARCH OVERPASS
        ===================================================== */

        const data =
            await fetchOverpass(
                query
            );


        const elements =
            Array.isArray(data.elements)
                ? data.elements
                : [];


        /* =====================================================
           CONVERT RESULTS
        ===================================================== */

        const results =
            elements
                .map(place => {

                    const tags =
                        place.tags || {};


                    const placeLat =
                        Number(
                            place.lat ??
                            place.center?.lat
                        );


                    const placeLon =
                        Number(
                            place.lon ??
                            place.center?.lon
                        );


                    if (
                        !Number.isFinite(placeLat) ||
                        !Number.isFinite(placeLon)
                    ) {

                        return null;

                    }


                    const name =
                        tags.name ||
                        tags["name:en"] ||
                        "Unnamed place";


                    return {

                        id:
                            `${place.type}-${place.id}`,

                        name,

                        type:
                            category,

                        category,

                        latitude:
                            placeLat,

                        longitude:
                            placeLon,

                        address:
                            buildAddress(tags),

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
                            null

                    };

                })

                .filter(Boolean);


        /* =====================================================
           REMOVE DUPLICATES
        ===================================================== */

        const uniqueResults =
            Array.from(

                new Map(

                    results.map(place => [

                        place.id,

                        place

                    ])

                ).values()

            );


        /* =====================================================
           CALCULATE DISTANCES
        ===================================================== */

        uniqueResults.forEach(place => {

            place.distanceKm =
                Number(

                    calculateDistance(

                        lat,

                        lon,

                        place.latitude,

                        place.longitude

                    ).toFixed(2)

                );

        });


        /* =====================================================
           SORT CLOSEST FIRST
        ===================================================== */

        uniqueResults.sort(

            (a, b) =>
                a.distanceKm -
                b.distanceKm

        );


        /* =====================================================
           LIMIT RESULTS
        ===================================================== */

        const limitedResults =
            uniqueResults.slice(
                0,
                30
            );


        console.log(
            `Found ${limitedResults.length} ${category} places`
        );


        /* =====================================================
           RESPONSE
        ===================================================== */

        return res.json({

            success: true,

            category,

            latitude:
                lat,

            longitude:
                lon,

            radiusKm:
                radius / 1000,

            count:
                limitedResults.length,

            results:
                limitedResults

        });


    } catch (error) {

        console.error(
            "Nearby places error:",
            error
        );


        return res.status(500).json({

            success: false,

            error:
                "Unable to find nearby places."

        });

    }

});


/* =========================================================
   BUILD ADDRESS
========================================================= */

function buildAddress(tags) {

    const parts = [];


    if (
        tags["addr:housenumber"]
    ) {

        parts.push(
            tags["addr:housenumber"]
        );

    }


    if (
        tags["addr:street"]
    ) {

        parts.push(
            tags["addr:street"]
        );

    }


    if (
        tags["addr:city"]
    ) {

        parts.push(
            tags["addr:city"]
        );

    }


    if (
        tags["addr:state"]
    ) {

        parts.push(
            tags["addr:state"]
        );

    }


    if (
        tags["addr:postcode"]
    ) {

        parts.push(
            tags["addr:postcode"]
        );

    }


    if (
        tags["addr:country"]
    ) {

        parts.push(
            tags["addr:country"]
        );

    }


    return parts.length
        ? parts.join(", ")
        : null;

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

    const earthRadius =
        6371;


    const dLat =
        degreesToRadians(
            lat2 - lat1
        );


    const dLon =
        degreesToRadians(
            lon2 - lon1
        );


    const a =
        Math.sin(dLat / 2) *
        Math.sin(dLat / 2) +

        Math.cos(
            degreesToRadians(
                lat1
            )
        ) *

        Math.cos(
            degreesToRadians(
                lat2
            )
        ) *

        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);


    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );


    return (
        earthRadius *
        c
    );

}


function degreesToRadians(
    degrees
) {

    return (
        degrees *
        (Math.PI / 180)
    );

}


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

        console.log(
            `🌎 Locora API running on port ${PORT}`
        );

        console.log(
            `Frontend: ${FRONTEND_URL}`
        );

    }
);
