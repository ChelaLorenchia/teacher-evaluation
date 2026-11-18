import apiHandler from '../../api/health-drive';
import { adaptVercelHandler } from './_lib/adaptVercel';

export const config = { path: '/api/health-drive' };
export const handler = adaptVercelHandler(apiHandler);
