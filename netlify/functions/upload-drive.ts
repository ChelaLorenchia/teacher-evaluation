import apiHandler from '../../api/upload-drive';
import { adaptVercelHandler } from './_lib/adaptVercel';

export const config = { path: '/api/upload-drive' };
export const handler = adaptVercelHandler(apiHandler);
