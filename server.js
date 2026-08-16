require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

const PORT = process.env.PORT || 3000;

const FRONTEND_URL =
    "https://hashari01.github.io";


/* =========================================================
   MIDDLEWARE
========================================================= */

app.disable("x-powered-by");

app.use(
    cors({
        origin: FRONTEND_URL,
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type"]
    })
);

app.use(
    express.json({
        limit: "50kb"
    })
);


/* =========================================================
   HOME / HEALTH CHECK
========================================================= */

app.get("/", (req, res) => {

    res.json({
        service: "Locora API",
        status: "online",
        version: "1.0.0"
    });

});


/* =========================================================
   SEARCH
========================================================= */

app.get("/search", async (req, res) => {

    try {

        const query =
            String(req.query.q || "").trim();

        if (!query) {

            return res.status(400).json({
                error: "Please enter a search."
            });

        }


        /*
         * For the first version, we're using
         * OpenStreetMap's public search service.
         *
         * This lets Locora find real places
         * without needing a paid API yet.
         */

        const url =
            "https://nominatim.openstreetmap.org/search" +
            "?format=json" +
            "&addressdetails=1" +
            "&limit=10" +
            "&q=" +
            encodeURIComponent(query);


        const response =
            await fetch(url, {
                headers: {
                    "User-Agent":
                        "Locora/1.0 (locora website)"
                }
            });


        if (!response.ok) {

            throw new Error(
                `Location service returned ${response.status}`
            );

        }


        const data =
            await response.json();


        const results =
            data.map(place => ({

                name:
                    place.display_name
                        ?.split(",")[0] ||
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
                    "place",

                category:
                    place.category ||
                    "unknown"

            }));


        res.json({
            success: true,
            query,
            results
        });


    } catch (error) {

        console.error(
            "Search error:",
            error
        );


        res.status(500).json({
            error:
                "Unable to search right now."
        });

    }

});


/* =========================================================
   404
========================================================= */

app.use((req, res) => {

    res.status(404).json({
        error: "Endpoint not found."
    });

});


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
            `📍 Locora API running on port ${PORT}`
        );

    }
);
