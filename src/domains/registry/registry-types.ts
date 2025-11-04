/**
 * Registry 数据源类型
 */
export type RegistrySource = "LOCAL" | "OFFICIAL";

/**
 * Registry Provider 抽象接口
 * 定义统一的 Registry 查询接口
 */
export interface IRegistryProvider {
  /**
   * 获取包配置
   * @param packageName - 包名
   * @returns 包配置,如果不存在返回 null
   */
  getPackageConfig(packageName: string): Promise<unknown | null>;

  /**
   * 检查包是否存在
   * @param packageName - 包名
   * @returns 是否存在
   */
  exists(packageName: string): Promise<boolean>;
}
