export async function expBackoff<T>(callback: () => Promise<T>, attempts: number = 5, delay: number = 1000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const attempt = () => {
        callback()
          .then(resolve)
          .catch((error) => {
            if (attempts === 1) {
              reject(error);
            } else {
              setTimeout(() => {
                expBackoff(callback, attempts - 1, delay * 2).then(resolve).catch(reject);
              }, delay);
            }
          });
      };
      attempt();
    });
  }