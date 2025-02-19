require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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
    const paymentCardCollection = client
      .db("quickGig")
      .collection("paymentCard");
    const paymentCollection = client.db("quickGig").collection("payments");
    const blogCollection = client.db("quickGig").collection("blogs");
    const reviewCollection = client.db("quickGig").collection("reviews");
    const withdrawalCollection = client
      .db("quickGig")
      .collection("withdrawals");
    const notificationCollection = client
      .db("quickGig")
      .collection("notifications");

    //add new notification
    app.post("addNotification", async (req, res) => {
      const data = req.body;
      const result = await notificationCollection.insertOne(data);
      res.send(result);
    });

    //get notification for email
    app.get("/notificaitons", async (req, res) => {
      const email = req.query.email;
      const filter = { email: email };
      const result = await notificationCollection
        .find(filter)
        .sort({ time: -1 })
        .toArray();
      res.send(result);
    });

    // blog related api
    app.get("/allBlogs", async (req, res) => {
      const result = await blogCollection.find().toArray();
      res.send(result);
    });
    // review related api
    app.get("/allReviews", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });
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
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unathorized" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
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
    //use verify buyer after verifytoken
    const verifyBuyer = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isBuyer = user?.role === "buyer";
      if (!isBuyer) {
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

      res.send({ worker });
    });

    //all users
    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    //delete user
    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
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

    //user by logged email
    app.get("/users/email", async (req, res) => {
      const email = { email: req.query.email };
      const result = await userCollection.findOne(email);
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
    app.post("/addTask", verifyToken, verifyBuyer, async (req, res) => {
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
      const sort = { completion_date: -1 };

      const result = await taskCollection.find(filter).sort(sort).toArray();
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

    app.get("/tasks", async (req, res) => {
      const { searchParams } = req.query;
      const { sort } = req.query;
      let options = {};
      if (sort) {
        options = { sort: { amount: sort === "asc" ? 1 : -1 } };
      }
      let query = {};
      if (searchParams) {
        query = { title: { $regex: searchParams, $options: "i" } };
      }

      const result = await taskCollection.find(query, options).toArray();
      res.send(result);
    });

    //manage tasks in admin(all tasks)
    app.get("/manageTasks", verifyToken, verifyAdmin, async (req, res) => {
      const result = await taskCollection.find().toArray();
      res.send(result);
    });

    //task delete from admin
    app.delete("/task:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await taskCollection.deleteOne(filter);
      res.send(result);
    });

    // Submission related api
    //add submit form into submitCollection
    app.post("/addSubmit", async (req, res) => {
      const submission = req.body;
      const result = await submitCollection.insertOne(submission);

      //add notification
      const notification = {
        message: `${submission.worker_name} has submitted a task: ${submission.task_title}.`,
        toEmail: submission.buyer_email,
        actionRoute: `/dashboard/buyer-home`,
        time: new Date(),
      };

      await notificationCollection.insertOne(notification);
      res.send({ message: "Submission created and notification sent", result });
    });

    //show all sumission api related worker email
    app.get("/allSubmission/worker", async (req, res) => {
      const email = req.query.email;
      const filter = { worker_email: email };
      const result = await submitCollection.find(filter).toArray();
      res.send(result);
    });

    //aprove submission
    app.patch("/submission/approve", async (req, res) => {
      const { submissionId, taskId } = req.body;
      const submission = await submitCollection.findOne({
        _id: new ObjectId(submissionId),
      });

      const { worker_email, payable_amount } = submission;

      //increment worker's collection
      const coinUpdateResult = await userCollection.updateOne(
        { email: worker_email },
        { $inc: { coin: payable_amount } }
      );

      // update submission status to approve
      const statusUpdate = await submitCollection.updateOne(
        {
          _id: new ObjectId(submissionId),
        },
        {
          $set: { status: "approve" },
        }
      );

      // //increment worker's collection
      const decreseWorker = await taskCollection.updateOne(
        { _id: new ObjectId(taskId) },
        { $inc: { req_workers: -1 } }
      );

      //add notification
      const notification = {
        message: `You have earned ${submission.payable_amount} from ${submission.buyer_name} for completing ${submission.task_title}`,
        toEmail: submission.worker_email,
        actionRoute: "/dashboard/worker-home",
        time: new Date(),
      };

      await notificationCollection.insertOne(notification);

      res.send({
        message: "Submission approved successfully",
        coinUpdateResult,
        statusUpdate,
      });
    });

    //reject submission
    app.patch("/submission/reject", async (req, res) => {
      const { submissionId, taskId } = req.body;

      const submission = await submitCollection.findOne({
        _id: new ObjectId(submissionId),
      });

      const { worker_email } = submission;

      // //increment worker's collection
      const increaseWorker = await taskCollection.updateOne(
        { _id: new ObjectId(taskId) },
        { $inc: { req_workers: 1 } }
      );

      // update submission status to approve
      const rejectstatusUpdate = await submitCollection.updateOne(
        {
          _id: new ObjectId(submissionId),
        },
        {
          $set: { status: "rejected" },
        }
      );

      res.send({ rejectstatusUpdate, increaseWorker });
    });

    //task to review.submission by buyer email where pending
    app.get("/submission/buyer_email", async (req, res) => {
      const email = req.query.email;
      const filter = { buyer_email: email, status: "pending" };
      const result = await submitCollection.find(filter).toArray();
      res.send(result);
    });

    //stats or analytics
    //admin
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

      //total payments
      const result2 = await paymentCollection
        .aggregate([
          {
            $group: {
              _id: null,
              allPayments: {
                $sum: "$price",
              },
            },
          },
        ])
        .toArray();

      const totalPayments = result2.length > 0 ? result2[0].allPayments : 0;
      res.send({ totalWorker, totalBuyer, totalAvailableCoin, totalPayments });
    });

    //buyer
    app.get("/buyer-stats", async (req, res) => {
      const email = req.query.email;
      const filter = { buyer_email: email };
      const totalTask = await taskCollection.countDocuments(filter);

      const result = await taskCollection
        .aggregate([
          {
            $match: filter,
          },
          {
            $group: {
              _id: null,
              totalWorkers: { $sum: "$req_workers" },
            },
          },
        ])
        .toArray();

      const pendingTask = result.length > 0 ? result[0].totalWorkers : 0;

      const filter2 = { email: email };
      const result2 = await paymentCardCollection
        .aggregate([
          {
            $match: filter2,
          },
          {
            $group: {
              _id: null,
              totalPrice: {
                $sum: "$coin",
              },
            },
          },
        ])
        .toArray();

      const totalPayment = result2.length > 0 ? result2[0].totalPrice : 0;

      res.send({ totalTask, pendingTask, totalPayment });
    });

    //worker
    app.get("/worker-stats", async (req, res) => {
      const email = req.query.email;
      const filter = { worker_email: email };

      const totalSubmission = await submitCollection.countDocuments(filter);
      const filter2 = { worker_email: email, status: "pending" };

      const pendingSubmission = await submitCollection.countDocuments(filter2);
      const filter3 = { worker_email: email, status: "approve" };

      const result = await submitCollection
        .aggregate([
          {
            $match: filter3,
          },
          {
            $group: {
              _id: null,
              totalPayableAmount: {
                $sum: "$payable_amount",
              },
            },
          },
        ])
        .toArray();

      const totalEarning = result.length > 0 ? result[0].totalPayableAmount : 0;
      res.send({ totalSubmission, pendingSubmission, totalEarning });
    });

    //approved submission in worker dash
    app.get("/approvedSubmissions", async (req, res) => {
      const email = req.query.email;
      const filter = { worker_email: email, status: "approve" };
      const result = await submitCollection.find(filter).toArray();
      res.send(result);
    });

    //paymentCard
    app.get("/payment-card", async (req, res) => {
      const result = await paymentCardCollection.find().toArray();
      res.send(result);
    });

    //payment card single details
    app.get("/paymentCard/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await paymentCardCollection.findOne(query);
      res.send(result);
    });

    //payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    //withdrawal form
    app.get("/withdrawal", async (req, res) => {
      const email = req.query.email;

      const filter = { email: email };
      const user = await userCollection.findOne(filter);

      let coins = user.coin;

      const withdrawalAmount = (coins / 20).toFixed(2);
      res
        .status(200)
        .send({ message: "Withdrawal successfull", coins, withdrawalAmount });
    });

    //add withdraw
    app.post("/addWithdraw", async (req, res) => {
      const data = req.body;

      const result = await withdrawalCollection.insertOne(data);
      res.send(result);
    });

    //withdraw request
    app.get("/withdrawRequest", async (req, res) => {
      const filter = { status: "pending" };
      const result = await withdrawalCollection.find(filter).toArray();
      res.send(result);
    });

    //payment success from withdraw request
    app.patch("/paymentSuccess/:id", async (req, res) => {
      const id = req.params.id;
      const { withdrawCoin, worker_email } = req.body;

      const withdrawalResult = await withdrawalCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "approved" } }
      );

      const userResult = await userCollection.updateOne(
        { email: worker_email },
        { $inc: { coin: -withdrawCoin } }
      );

      res.send({ withdrawCoin, userResult });
    });

    //payment related api
    app.get("/paymentHistory/:email", verifyToken, async (req, res) => {
      const query = { email: req.params.email };
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });
    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);

      const { email, price } = payment;
      let coinsToAdd = 0;
      if (price === 1) coinsToAdd = 10;
      else if (price === 10) coinsToAdd = 150;
      else if (price === 20) coinsToAdd = 500;
      else if (price === 35) coinsToAdd = 1000;
      const coinUpdate = await userCollection.updateOne(
        { email },
        { $inc: { coin: coinsToAdd } }
      );
      res.send(paymentResult);
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
