require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 4000;

//middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ri84s.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    console.log("db running");

    const userCollection = client.db("quickGig").collection("users");
    const taskCollection = client.db("quickGig").collection("tasks");
    const submitCollection = client.db("quickGig").collection("submit");
    //jwt related api

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    //middlarwared
    const verifyToken = (req, res, next) => {
      // console.log("Inside verify token", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unathorized" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
        // console.log(decoded);
        if (error) {
          return res.status(401).send({ message: "unathorized" });
        }
        req.decoded = decoded;
        next();
      });
      // next();
    };

    //use verify admin after verifytoken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    //users related api

    //add user
    app.post("/users", async (req, res) => {
      const user = req.body;
      //insert email if user doesn't exists:
      //you can do this many ways(1. email uniques, 2.upsert, 3. simple checking)
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    //check admin
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }

      // console.log(admin);
      res.send({ admin });
    });
    //check buyer
    app.get("/users/buyer/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let buyer = false;
      if (user) {
        buyer = user?.role === "buyer";
      }

      // console.log(admin);
      res.send({ buyer });
    });
    //check worker
    app.get("/users/worker/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let worker = false;
      if (user) {
        worker = user?.role === "worker";
      }

      // console.log(admin);
      res.send({ worker });
    });

    //all users
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    //delete user
    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(filter);
      res.send(result);
    });

    //sort for best workers
    app.get("/sortWorkers", async (req, res) => {
      const filter = { role: "worker" };
      const sort = { coin: -1 };
      const result = await userCollection.find(filter).sort(sort).toArray();
      res.send(result);
    });

    app.patch(
      "/users/makeRole/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const { role } = req.body;
        const updatedDoc = {
          $set: {
            role: role,
          },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    //task related api

    //add task
    app.post("/addTask", verifyToken, async (req, res) => {
      const data = req.body;

      //reduce coin
      const totalPayableAmount = data.req_workers * data.amount;

      const user = await userCollection.findOne({ email: data?.buyer_email });
      if (!user || user.coin < totalPayableAmount) {
        return res
          .status(400)
          .send({ error: "Not avaiable Coin. Purchase Coin" });
      }
      const result = await taskCollection.insertOne(data);

      const filter = { email: data?.buyer_email };
      const updateDoc = {
        $inc: { coin: -totalPayableAmount },
      };

      const updateCoin = await userCollection.updateOne(filter, updateDoc);
      res.send({ result, updateCoin });
    });

    //my tasks by email
    app.get("/tasks/owner", async (req, res) => {
      const email = req.query.email;
      const filter = { buyer_email: email };
      // const sort = { date: -1 };

      const result = await taskCollection.find(filter).toArray();
      // console.log(result);
      res.send(result);
    });

    app.get("/task/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await taskCollection.findOne(query);
      res.send(result);
    });

    //update task
    app.patch("/task/:id", async (req, res) => {
      const task = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          title: task.title,
          detail: task.detail,
          req_workers: task.req_workers,
          amount: task.amount,
          completion_date: task.completion_date,
          sub_info: task.sub_info,
          task_img_url: task.task_img_url,
        },
      };
      const result = await taskCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    //delete task
    app.delete("/task/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      //get the task by parameter id
      const task = await taskCollection.findOne({ _id: new ObjectId(id) });

      const totalRefundAmount = task.req_workers * task.amount;

      // refund coin in coin collection
      const filter = { email: task.buyer_email };
      const updateDoc = {
        $inc: { coin: totalRefundAmount },
      };
      const coinRefund = await userCollection.updateOne(filter, updateDoc);

      const result = await taskCollection.deleteOne(query);

      res.send(result);
    });

    //all task where required_worker > 0
    app.get("/allTasks", async (req, res) => {
      const query = { req_workers: { $gt: 0 } };
      const result = await taskCollection.find(query).toArray();
      res.send(result);
    });

    // Submission related api
    //add submit form into submitCollection
    app.post("/addSubmit", async (req, res) => {
      const data = req.body;
      const result = await submitCollection.insertOne(data);
      res.send(result);
    });

    //show all sumission api related worker email
    app.get("/allSubmission/worker", async (req, res) => {
      const email = req.query.email;
      const filter = { worker_email: email };
      const result = await submitCollection.find(filter).toArray();
      res.send(result);
    });

    //task to review.submission by buyer email where pending
    app.get("/submission/buyer_email", async (req, res) => {
      const email = req.query.email;
      console.log("dd", email);
      const filter = { buyer_email: email, status: "pending" };
      const result = await submitCollection.find(filter).toArray();
      console.log(result);
      res.send(result);
    });

    //stats or analytics
    app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
      const filterWorker = { role: "worker" };
      const totalWorker = await userCollection.countDocuments(filterWorker);
      const filterBuyer = { role: "buyer" };
      const totalBuyer = await userCollection.countDocuments(filterBuyer);
      const result = await userCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalCoin: {
                $sum: "$coin",
              },
            },
          },
        ])
        .toArray();

      const totalAvailableCoin = result.length > 0 ? result[0].totalCoin : 0;
      res.send({ totalWorker, totalBuyer, totalAvailableCoin });
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server is running");
});

app.listen(port, () => {
  console.log(`QuickGig is running on port ${port}`);
});
