import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import axios from "axios";
import userRouter from "./routes/user.routes.js";
import healthcheckRouter from "./routes/healthcheck.routes.js";
import ProductData from "./models/product.model.js";
const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

// Endpoint to fetch data and seed database
app.get("/initialize", async (req, res) => {
  // res.status(200).send("Database initialized with seed data.");
  try {
    // Fetch data from the third-party API
    const response = await axios.get(
      "https://s3.amazonaws.com/roxiler.com/product_transaction.json"
    );
    const products = response.data;

    // Delete all existing documents in the collection
    await ProductData.deleteMany({});

    // // Insert new documents
    await ProductData.insertMany(products);

    res.status(200).json({
      message: "Database initialized with seed data.",
      products: products,
    });
  } catch (error) {
    console.error("Error initializing database:", error);
    res.status(500).send("Error initializing database.");
  }
});

// Endpoint to list all transactions with search and pagination
app.get("/transactions", async (req, res) => {
  const { month, search = "", page = 1, perPage = 10 } = req.query;

  // Validate month input
  if (
    month &&
    !/^(January|February|March|April|May|June|July|August|September|October|November|December)$/i.test(
      month
    )
  ) {
    return res.status(400).send("Invalid month provided.");
  }

  // Build query
  let query = {};
  if (month) {
    const monthIndex = new Date(Date.parse(month + " 1, 2022")).getMonth() + 1; // Convert month name to month index
    query.dateOfSale = {
      $gte: new Date(
        `2022-${monthIndex.toString().padStart(2, "0")}-01T00:00:00.000Z`
      ),
      $lt: new Date(
        `2022-${(monthIndex + 1).toString().padStart(2, "0")}-01T00:00:00.000Z`
      ),
    };
  }

  // Search query
  if (search) {
    const regex = new RegExp(search, "i"); // Case-insensitive search
    query.$or = [{ title: regex }, { description: regex }, { price: regex }];
  }

  // Pagination
  const pageNumber = parseInt(page, 10) || 1;
  const itemsPerPage = parseInt(perPage, 10) || 10;

  try {
    const totalItems = await ProductData.countDocuments(query);
    const products = await ProductData.find(query)
      .skip((pageNumber - 1) * itemsPerPage)
      .limit(itemsPerPage);

    res.json({
      totalItems,
      totalPages: Math.ceil(totalItems / itemsPerPage),
      currentPage: pageNumber,
      perPage: itemsPerPage,
      products,
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).send("Error fetching transactions.");
  }
});

// Endpoint for statistics
app.get("/statistics", async (req, res) => {
  const { month } = req.query;

  try {
    if (month) {
      // Single month statistics
      if (
        !/^(January|February|March|April|May|June|July|August|September|October|November|December)$/i.test(
          month
        )
      ) {
        return res.status(400).send("Invalid month provided.");
      }

      const monthIndex =
        new Date(Date.parse(month + " 1, 2022")).getMonth() + 1; // Convert month name to month index
      const startDate = new Date(
        `2022-${monthIndex.toString().padStart(2, "0")}-01T00:00:00.000Z`
      );
      const endDate = new Date(
        `2022-${(monthIndex + 1).toString().padStart(2, "0")}-01T00:00:00.000Z`
      );

      // Calculate total sale amount
      const totalSaleAmount = await ProductData.aggregate([
        {
          $match: { dateOfSale: { $gte: startDate, $lt: endDate }, sold: true },
        },
        { $group: { _id: null, totalAmount: { $sum: "$price" } } },
      ]);

      // Calculate total number of sold items
      const totalSoldItems = await ProductData.countDocuments({
        dateOfSale: { $gte: startDate, $lt: endDate },
        sold: true,
      });

      // Calculate total number of not sold items
      const totalNotSoldItems = await ProductData.countDocuments({
        dateOfSale: { $gte: startDate, $lt: endDate },
        sold: false,
      });

      res.json({
        totalSaleAmount: totalSaleAmount.length
          ? totalSaleAmount[0].totalAmount
          : 0,
        totalSoldItems,
        totalNotSoldItems,
      });
    } else {
      // All months statistics
      const stats = await ProductData.aggregate([
        {
          $group: {
            _id: {
              year: { $year: "$dateOfSale" },
              month: { $month: "$dateOfSale" },
            },
            totalSaleAmount: {
              $sum: { $cond: [{ $eq: ["$sold", true] }, "$price", 0] },
            },
            totalSoldItems: {
              $sum: { $cond: [{ $eq: ["$sold", true] }, 1, 0] },
            },
            totalNotSoldItems: {
              $sum: { $cond: [{ $eq: ["$sold", false] }, 1, 0] },
            },
          },
        },
        {
          $sort: { "_id.year": 1, "_id.month": 1 },
        },
      ]);

      res.json(stats);
    }
  } catch (error) {
    console.error("Error fetching statistics:", error);
    res.status(500).send("Error fetching statistics.");
  }
});

// Endpoint for bar chart data
app.get("/bar-chart", async (req, res) => {
  const { month } = req.query;

  try {
    if (month) {
      // Validate month input
      if (
        !/^(January|February|March|April|May|June|July|August|September|October|November|December)$/i.test(
          month
        )
      ) {
        return res.status(400).send("Invalid month provided.");
      }

      const monthIndex =
        new Date(Date.parse(month + " 1, 2022")).getMonth() + 1; // Convert month name to month index
      const startDate = new Date(
        `2022-${monthIndex.toString().padStart(2, "0")}-01T00:00:00.000Z`
      );
      const endDate = new Date(
        `2022-${(monthIndex + 1).toString().padStart(2, "0")}-01T00:00:00.000Z`
      );

      // Calculate item counts for price ranges
      const priceRanges = [
        { range: "0-100", min: 0, max: 100 },
        { range: "101-200", min: 101, max: 200 },
        { range: "201-300", min: 201, max: 300 },
        { range: "301-400", min: 301, max: 400 },
        { range: "401-500", min: 401, max: 500 },
        { range: "501-600", min: 501, max: 600 },
        { range: "601-700", min: 601, max: 700 },
        { range: "701-800", min: 701, max: 800 },
        { range: "801-900", min: 801, max: 900 },
        { range: "901-above", min: 901, max: Infinity },
      ];

      const result = await Promise.all(
        priceRanges.map(async (range) => {
          const count = await ProductData.countDocuments({
            dateOfSale: { $gte: startDate, $lt: endDate },
            price: { $gte: range.min, $lte: range.max },
          });
          return { range: range.range, count };
        })
      );

      res.json(result);
    } else {
      // If no month is provided, return an error message
      res.status(400).send("Month parameter is required.");
    }
  } catch (error) {
    console.error("Error fetching bar chart data:", error);
    res.status(500).send("Error fetching bar chart data.");
  }
});

app.get("/pie-chart", async (req, res) => {
  const { month } = req.query;
  try {
    if (month) {
      if (
        !/^(January|February|March|April|May|June|July|August|September|October|November|December)$/i.test(
          month
        )
      ) {
        return res.status(400).send("Invalid month provided.");
      }

      const monthIndex =
        new Date(Date.parse(month + " 1, 2022")).getMonth() + 1; // Convert month name to month index
      const startDate = new Date(
        `2022-${monthIndex.toString().padStart(2, "0")}-01T00:00:00.000Z`
      );
      const endDate = new Date(
        `2022-${(monthIndex + 1).toString().padStart(2, "0")}-01T00:00:00.000Z`
      );

      const categoryCounts = await ProductData.aggregate([
        {
          $match: { dateOfSale: { $gte: startDate, $lt: endDate } },
        },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]);

      res.json(
        categoryCounts.map((item) => ({
          category: item._id,
          count: item.count,
        }))
      );
    } else {
      const categoryCounts = await ProductData.aggregate([
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]);

      res.json(
        categoryCounts.map((item) => ({
          category: item._id,
          count: item.count,
        }))
      );
    }
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get("/combined", async (req, res) => {
  const { month } = req.query;

  try {
    if (month) {
      const [statistics, barChart, pieChart] = await Promise.all([
        axios.get(
          `http://localhost:${process.env.PORT}/statistics/?month=${month}`
        ),
        axios.get(
          `http://localhost:${process.env.PORT}/bar-chart/?month=${month}`
        ),
        axios.get(
          `http://localhost:${process.env.PORT}/pie-chart/?month=${month}`
        ),
      ]);
      res.json({
        statistics: statistics.data,
        barChart: barChart.data,
        pieChart: pieChart.data,
      });
    } else {
      res.status(400).send("Month parameter is required.");
    }
  } catch (error) {
    res.status(500).send(error.message);
  }
});

//routes declaration
app.use("/api/v1/healthcheck", healthcheckRouter);
app.use("/api/v1/users", userRouter);

// http://localhost:8000/api/v1/users/register

export { app };
