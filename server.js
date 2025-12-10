import express from "express";
import axios from "axios";
import cors from "cors";
import btoa from "btoa";

const app = express();
app.use(express.json());
app.use(cors());

/**
 * Track → Hostaway-style listings endpoint
 * Input: { domain, apiKey, apiSecret }
 */
app.post("/track/listings", async (req, res) => {
  const { domain, apiKey, apiSecret } = req.body;

  if (!domain || !apiKey || !apiSecret) {
    return res.status(400).json({ error: "Missing domain, apiKey, or apiSecret" });
  }

  const baseUrl = `https://${domain}.trackhs.com/api/pms/units`;
  const authHeader = "Basic " + btoa(`${apiKey}:${apiSecret}`);

  let page = 1;
  const pageSize = 100;
  let activeUnits = [];

  console.log("Track → Hostaway server running on port 3000");

  try {
    while (true) {
      const url = `${baseUrl}?page=${page}&size=${pageSize}`;
      console.log(`Fetching page ${page}: ${url}`);

      let response;
      try {
        response = await axios.get(url, {
          headers: {
            Authorization: authHeader,
            Accept: "application/json"
          }
        });
      } catch (err) {
        // Handle Track "Invalid page" signal (LAST PAGE)
        if (err.response?.status === 409) {
          console.log("Reached last page — stopping pagination.");
          break;
        }

        console.error("Track fetch error:", err.response?.data || err);
        return res.status(500).json({
          error: "Failed to fetch Track listings",
          details: err.response?.data || err.toString()
        });
      }

      const units =
        response.data?._embedded?.units ??
        response.data?.units ??
        [];

      // No more units → stop pagination
      if (units.length === 0) {
        console.log("Empty page received — stopping pagination.");
        break;
      }

      // Keep only active units
      const onlyActive = units.filter(u => u.isActive === true);

      // Transform to Hostaway-style JSON
      const transformed = onlyActive.map(u => {
        const wifiRaw = u.custom?.pms_units_wifi_details || "";
        let wifiUsername = "";
        let wifiPassword = "";

        if (wifiRaw.includes("|")) {
          const parts = wifiRaw.split("|");
          wifiUsername = parts[0].trim();
          wifiPassword = parts[1].trim();
        }

        const beds = Array.isArray(u.bedTypes)
          ? u.bedTypes.reduce((sum, b) => sum + (b.count || 0), 0)
          : null;

        return {
          id: u.id,
          name: u.name || "",
          street: u.streetAddress || "",
          address: `${u.streetAddress || ""}, ${u.locality || ""}, ${u.region || ""} ${u.postal || ""}`,
          city: u.locality || "",
          state: u.region || "",
          zipcode: u.postal || "",
          bedrooms: u.bedrooms ?? null,
          beds: beds,
          bathrooms: u.fullBathrooms ?? null,
          wifiUsername: wifiUsername,
          wifiPassword: wifiPassword,
          cleannessStatus: String(u.cleanStatusId ?? ""),
          picture: u.coverImage || null
        };
      });

      activeUnits.push(...transformed);
      page++;
    }

    return res.json({
      count: activeUnits.length,
      listings: activeUnits
    });

  } catch (err) {
    console.error("Unhandled Track fetch error:", err);
    return res.status(500).json({
      error: "Critical server error",
      details: err.toString()
    });
  }
});

app.listen(3000, () => console.log("Track → Hostaway server running on port 3000"));
