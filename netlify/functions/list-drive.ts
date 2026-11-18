import apiHandler from '../../api/list-drive';
import { adaptVercelHandler } from './_lib/adaptVercel';

export const config = { path: '/api/list-drive' };
export const handler = adaptVercelHandler(apiHandler);
