import apiHandler from '../../api/delete-drive';
import { adaptVercelHandler } from './_lib/adaptVercel';

export const config = { path: '/api/delete-drive' };
export const handler = adaptVercelHandler(apiHandler);
