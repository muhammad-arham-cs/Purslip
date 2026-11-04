import { module } from "@prisma/composer";
import purslipService from "./src/service.ts";

export default module("purslip-app", ({ provision }) => {
  provision(purslipService);
});
