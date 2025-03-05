const express = require('express');
const app = express();
const path = require('path');
const session = require('express-session');
const flash = require('express-flash');
require('dotenv').config();
const passport = require('./config/passport');
const Swal = require('sweetalert2');
const db = require('./config/db');
const userRouter = require('./routes/userRouter');
const adminRouter = require('./routes/adminRouter');
const methodOverride = require('method-override');
const MongoStore = require('connect-mongo');
const morgan = require('morgan');
const helmet = require('helmet');
const csrf = require('csurf');
const cookieParser = require('cookie-parser');

const { log } = require('console');
db();
app.use(express.json());
app.use(flash());

app.use((req, res, next) => {
  res.setHeader('Cache-control', 'no-store');
  next();
});

app.use(cookieParser()); // Parse cookies

app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 72 * 60 * 60 * 1000,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.set('view engine', 'ejs');
app.set('views', [
  path.join(__dirname, 'views/user'),
  path.join(__dirname, 'views/admin'),
]);
app.use(morgan('dev'));
//app.use(helmet());

app.use(express.static(path.join(__dirname, 'public')));
app.use('/', userRouter);
app.use('/admin', adminRouter);
app.use(methodOverride('_method'));
const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log('Server running');
});

module.exports = app;
