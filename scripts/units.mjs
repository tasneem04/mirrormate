// Print the YouCam unit balance (free call). Usage: npm run units
import { getUnits } from '../api/_youcam.js';

console.log(JSON.stringify(await getUnits(), null, 2));
