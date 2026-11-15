const express = require("express");
const { interpret, search } = require("../Controllers/aiConciergeController");

const router = express.Router();

router.post("/concierge/interpret", interpret);
router.post("/concierge/search", search);

module.exports = router;
