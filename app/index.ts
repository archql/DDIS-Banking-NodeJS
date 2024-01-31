import express from 'express';
import hbs from 'express-handlebars';
import http from 'http';
import path from 'path';
import {fileURLToPath} from 'url';
import * as helpers from '../helpers/helpers.js'
//import {Controller} from "./entities/controller.js";

// get current filename and directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// setup our server data
const PORT = 8000;
const HOST = 'localhost';

// setup express
const server_root = path.resolve(__dirname, '../public');
const server_views = path.resolve(__dirname, '../views');
const server_attachments = path.resolve(__dirname, '../uploads');
const app = express();
const handlebars = hbs.create({
    layoutsDir: server_views + '/layouts',
    extname: '.hbs',
    defaultLayout: 'main',
    helpers: helpers
});
// handlebars setup
app.engine('.hbs', handlebars.engine);
app.set('view engine', '.hbs');
app.set('views', server_views);
app.use(express.urlencoded({extended: false}));
app.use(express.json())
app.use(express.static(server_root));
app.use('/attachments', express.static(server_attachments))

// create server
const server = http.createServer(app);

app.get('/',(req,res) => {
    res.render('main.hbs', {layout : 'index'});
});

// 404
app.all('*', function(req, res){
    res.status(404).render('404.hbs', {layout : 'index'});
});

// enable
server.listen(PORT, HOST, () => {
    console.log(`Server is running on ${HOST}:${PORT}`);
});