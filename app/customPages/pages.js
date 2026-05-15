import HealthPage from '../health/page';
import HomePage from '../home/page';
import InstantPage from '../instant/page';
import ClosedPage from '../closed/page';
import ShipPage from '../argumentatividad/page';
import AutistaPage from '../autista/page';

const pages = {
  '/': HomePage,
  '/health': HealthPage,
  '/instant': InstantPage,
  '/closed': ClosedPage,
  '/argumentatividad': ShipPage,
  '/autista': AutistaPage,
};

export default pages;