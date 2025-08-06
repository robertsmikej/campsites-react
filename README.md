# To Install
Run `npm install`

Run `npm start`

# To Customize
Set your own Campgrounds and site options in `/json/sites.js` and `App.js`.

# Important Info
Data is cached for ~10 minutes - to get refresh it manually, clear Local Storage or click 'Refresh Data' button at top (Do this sparingly, see below). 

The app has to make a call for each campground, and one for each month you want to check in that campground, so calls add up quick. Don't refresh data with calls too much or Recreation.gov will block you for awhile. This doesn't happen much, but if you start getting 429 errors, this is probably what's happening.


## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test` - Not implemented yet

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build` - Not implemented yet

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.
