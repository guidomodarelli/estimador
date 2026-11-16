/** Error de entrada inválida en el modelo de estimación (datos del usuario, no bug interno). */
export class EstimationInputError extends Error {
  /**
   * @param {string} message
   * @param {{cause?: unknown}} [options]
   */
  constructor(message, options) {
    super(message, options);
    this.name = 'EstimationInputError';
  }
}
