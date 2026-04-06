const {
    handleError
} = require('./helpers');


const asyncHandler = (fn, defaultErrorMessage = 'Ocorreu um erro inesperado.') => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch((error) => {

            handleError(res, error, defaultErrorMessage);
        });
    };
};

module.exports = asyncHandler;