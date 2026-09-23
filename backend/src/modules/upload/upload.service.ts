import { BadRequestException, Injectable } from '@nestjs/common';
import * as qiniu from 'qiniu';

@Injectable()
export class UploadService {
  private mac: qiniu.auth.digest.Mac;

  constructor() {
    this.mac = new qiniu.auth.digest.Mac(
      process.env.QINIU_ACCESS_KEY || '',
      process.env.QINIU_SECRET_KEY || '',
    );
  }

  // 获取上传凭证
  getUploadToken(bucket: string = process.env.QINIU_BUCKET || '') {
    const options = {
      scope: bucket,
      expires: 600,
    };
    const putPolicy = new qiniu.rs.PutPolicy(options);
    const uploadToken = putPolicy.uploadToken(this.mac);

    return {
      token: uploadToken,
      domain: process.env.QINIU_DOMAIN,
      bucket,
    };
  }

  // 获取文件上传凭证（指定文件名前缀）
  getUploadTokenWithPrefix(prefix: string) {
    const safe = String(prefix || '')
      .replace(/\\/g, '/')
      .replace(/\.\./g, '')
      .replace(/[^a-zA-Z0-9/_-]/g, '')
      .replace(/^\/+|\/+$/g, '')
      .slice(0, 64);
    if (!safe) throw new BadRequestException('上传路径无效');
    const bucket = process.env.QINIU_BUCKET || '';
    const options = {
      scope: bucket,
      expires: 600,
      saveKey: `${safe}/$(etag)$(ext)`,
    };
    const putPolicy = new qiniu.rs.PutPolicy(options);
    const uploadToken = putPolicy.uploadToken(this.mac);

    return {
      token: uploadToken,
      domain: process.env.QINIU_DOMAIN,
      bucket,
    };
  }
}
