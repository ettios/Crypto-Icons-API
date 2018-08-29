const express = require('express')
const app = express()
const { convert } = require('convert-svg-to-png')
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const { document } = (new JSDOM('')).window
const fs = require('fs');
const path = require('path');


app.use(express.static(__dirname + '/public'));

// GET Home page
app.get('/', function(req, res) {
  res.sendFile('index.html');
})

// GET png
app.get('/api/:style/:currency/:size', async(req, res) => {
  // Params
  const style = req.params.style
  const currency = req.params.currency
  const size = req.params.size
  const cacheKey = req.path
  
  // Redis
  var redisRetryStrategy = function(options) {
    if (options.error.code === 'ECONNREFUSED') 
    {
      return;
    }
  }
  
  const redisURL = process.env.REDIS_URL || 'http://127.0.0.1:6379'
  var client = require('redis').createClient({
    url : process.env.REDIS_URL,
    return_buffers : true
  })
  
  client.on('error', function (err) {
    client.quit()
    generatePNG(req, res, null)
  })
  
  client.on('connect', function (err) {
    // Check cache
    client.get(cacheKey, async(error, result) => {
      if (result == null)
      {
        console.log("Cache miss")
        generatePNG(req, res, client)
      }
      else
      {
        console.log("Cache hit")
        res.set('Content-Type', 'image/png');
        res.send(result);
      }
    })
  })
})

// Functions

async function generatePNG(req, res, redis) {
  // Params
  const style = req.params.style
  const currency = req.params.currency
  const size = req.params.size
  const cacheKey = req.path
    
  // SVG file path
  const svgPath = path.join(__dirname, 'public', 'svg', style, currency + '.svg');

  // Check if file exists
  if (!fs.existsSync(svgPath)) 
  {
    res.status(404).send(null);
    return
  }

  const svg = fs.readFileSync(svgPath, 'utf8');  
  const element = document.createElement('div')
  element.innerHTML = svg

  const svgElement = element.getElementsByTagName("svg")[0]

  // Set viewBox so SVG resizes correctly
  const originalSize = svgElement.getAttribute('width')
  svgElement.setAttribute('viewBox', '0 0 ' + originalSize + ' ' + originalSize)

  // Set requested size
  svgElement.setAttribute('width', size)
  svgElement.setAttribute('height', size)

  // Convert to PNG
  const png = await convert(element.innerHTML, {
    'height' : size, 
    'width' : size,
    'puppeteer' : {'args' : ['--no-sandbox', '--disable-setuid-sandbox']}
  });

  // Save to redis
  if (redis != null)
  {
    redis.set(cacheKey, png);
  }
  
  // Return response
  res.set('Content-Type', 'image/png');
  res.send(png);
} 

// Listen
var port = process.env.PORT || 3000;
app.listen(port, () => console.log('Our app is running on http://localhost:' + port))