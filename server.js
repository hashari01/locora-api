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
        version: "2.0.0"
    });
});


/* =========================================================
   LOCATION SEARCH
   Example:
   /search?q=Indianapolis
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

        const response = await fetch(url, {
            headers: {
                "User-Agent":
                    "Locora/2.0 (location discovery website)"
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
                    place.type || "unknown",

                category:
                    place.category || "unknown"
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
   NEARBY PLACE SEARCH
   Example:
   /places?lat=39.7683&lon=-86.1583&category=restaurant
========================================================= */

const CATEGORY_FILTERS = {

    restaurant: `
        nwr["amenity"="restaurant"];
    `,

    coffee: `
        nwr["amenity"="cafe"];
    `,

    hotel: `
        nwr["tourism"="hotel"];
    `,

    shopping: `
        nwr["shop"];
    `,

    things: `
        nwr["tourism"~"attraction|museum|gallery|theme_park|zoo"];
        nwr["leisure"~"park|sports_centre|stadium"];
    `,

    service: `
        nwr["shop"];
        nwr["amenity"];
    `
};


/* =========================================================
   PLACES ENDPOINT
========================================================= */

app.get("/places", async (req, res) => {

    try {

        const lat =
            Number(req.query.lat);

        const lon =
            Number(req.query.lon);

        const category =
            typeof req.query.category === "string"
                ? req.query.category.toLowerCase()
                : "";

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

        if (!CATEGORY_FILTERS[category]) {
            return res.status(400).json({
                success: false,
                error:
                    "Invalid category.",
                availableCategories:
                    Object.keys(CATEGORY_FILTERS)
            });
        }


        /*
         * Search radius:
         * 5 kilometers around the searched location.
         */

        const radius = 5000;

        const filters =
            CATEGORY_FILTERS[category];


        /*
         * Overpass query.
         *
         * This searches OpenStreetMap for
         * REAL places around the coordinates.
         */

        const query = `
[out:json][timeout:25];

(
    ${filters}
);

out center tags;
`;


        /*
         * Add coordinates to every filter
         * automatically.
         *
         * Replace the category blocks with
         * radius-based queries.
         */

        let radiusQuery = "";


        if (category === "restaurant") {

            radiusQuery = `
[out:json][timeout:25];

nwr(
    around:${radius},${lat},${lon}
)["amenity"="restaurant"];

out center tags;
`;

        } else if (category === "coffee") {

            radiusQuery = `
[out:json][timeout:25];

nwr(
    around:${radius},${lat},${lon}
)["amenity"="cafe"];

out center tags;
`;

        } else if (category === "hotel") {

            radiusQuery = `
[out:json][timeout:25];

nwr(
    around:${radius},${lat},${lon}
)["tourism"="hotel"];

out center tags;
`;

        } else if (category === "shopping") {

            radiusQuery = `
[out:json][timeout:25];

nwr(
    around:${radius},${lat},${lon}
)["shop"];

out center tags;
`;

        } else if (category === "things") {

            radiusQuery = `
[out:json][timeout:25];

(
    nwr(
        around:${radius},${lat},${lon}
    )["tourism"~"attraction|museum|gallery|theme_park|zoo"];

    nwr(
        around:${radius},${lat},${lon}
    )["leisure"~"park|sports_centre|stadium"];
);

out center tags;
`;

        } else if (category === "service") {

            radiusQuery = `
[out:json][timeout:25];

(
    nwr(
        around:${radius},${lat},${lon}
    )["shop"];

    nwr(
        around:${radius},${lat},${lon}
    )["amenity"];
);

out center tags;
`;
        }


        const overpassResponse =
            await fetch(
                "https://overpass-api.de/api/interpreter",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/x-www-form-urlencoded",
                        "User-Agent":
                            "Locora/2.0"
                    },

                    body:
                        new URLSearchParams({
                            data: radiusQuery
                        })
                }
            );


        if (!overpassResponse.ok) {

            throw new Error(
                `Overpass returned ${overpassResponse.status}`
            );
        }


        const data =
            await overpassResponse.json();


        const elements =
            Array.isArray(data.elements)
                ? data.elements
                : [];


        const results =
            elements
                .map(place => {

                    const tags =
                        place.tags || {};


                    /*
                     * Nodes have lat/lon directly.
                     * Ways/relations use center.
                     */

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


                    let type =
                        category;


                    return {

                        id:
                            `${place.type}-${place.id}`,

                        name,

                        type,

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


        /*
         * Remove duplicates by ID.
         */

        const uniqueResults =
            Array.from(
                new Map(
                    results.map(place => [
                        place.id,
                        place
                    ])
                ).values()
            );


        /*
         * Sort by distance from the
         * searched location.
         */

        uniqueResults.sort(
            (a, b) => {

                const distanceA =
                    calculateDistance(
                        lat,
                        lon,
                        a.latitude,
                        a.longitude
                    );

                const distanceB =
                    calculateDistance(
                        lat,
                        lon,
                        b.latitude,
                        b.longitude
                    );

                return distanceA - distanceB;
            }
        );


        /*
         * Return the closest 30 places.
         */

        const limitedResults =
            uniqueResults
                .slice(0, 30)
                .map(place => ({
                    ...place,

                    distanceKm:
                        Number(
                            calculateDistance(
                                lat,
                                lon,
                                place.latitude,
                                place.longitude
                            ).toFixed(2)
                        )
                }));


        return res.json({

            success: true,

            category,

            latitude: lat,

            longitude: lon,

            radiusKm: 5,

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

    if (tags["addr:housenumber"]) {
        parts.push(
            tags["addr:housenumber"]
        );
    }

    if (tags["addr:street"]) {
        parts.push(
            tags["addr:street"]
        );
    }

    if (tags["addr:city"]) {
        parts.push(
            tags["addr:city"]
        );
    }

    if (tags["addr:state"]) {
        parts.push(
            tags["addr:state"]
        );
    }

    if (tags["addr:postcode"]) {
        parts.push(
            tags["addr:postcode"]
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

    const earthRadius = 6371;

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
            degreesToRadians(lat1)
        ) *

        Math.cos(
            degreesToRadians(lat2)
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


function degreesToRadians(degrees) {

    return degrees *
        (Math.PI / 180);
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
    (error, req, res, next) => {

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
