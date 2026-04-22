import './style.css';
import Alpine from 'alpinejs';
import { timeclockData } from './components/timeclock';

Alpine.data('timeclockData', timeclockData);

// @ts-expect-error -- devtools access
window.Alpine = Alpine;

Alpine.start();
