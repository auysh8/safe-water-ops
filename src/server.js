const express = require("express");
const cors = require("cors");
require("dotenv").config();
const path = require("path");

const authRoutes = require("./routes/authRoutes");
const summaryRoutes = require("./routes/summaryRoutes");
const locationRoutes = require("./routes/locationRoutes");
const visitRoutes = require("./routes/visitRoutes"); // Add this import

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));
app.use("/api/analytics", summaryRoutes);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/visits", visitRoutes); // Register visits endpoint
app.use("/api/locations", locationRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

const PORT = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;

